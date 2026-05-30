import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { classifyQuestion, answerFromDocuments, generateEscalationRecommendation } from "@/lib/openai";
import { getCommonDocuments, getCandidateDocuments, getFileContent } from "@/lib/box";
import { sendEscalationNotification } from "@/lib/resend";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { candidateId, question, conversationId } = body;

  if (!candidateId || !question) {
    return NextResponse.json({ error: "candidateId and question are required" }, { status: 400 });
  }

  const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  // Get or create conversation
  let convId = conversationId;
  if (!convId) {
    const conv = await prisma.conversation.create({ data: { candidateId } });
    convId = conv.id;
  }

  // Save user message
  const userMessage = await prisma.message.create({
    data: { conversationId: convId, role: "USER", content: question },
  });

  // Track activity
  await prisma.candidateActivity.create({
    data: { candidateId, type: "QUESTION", description: question },
  });

  // Classify question
  const classification = await classifyQuestion(question);
  console.log("[classify]", question, "→", classification.classification, classification.category, classification.documentScope);

  if (classification.classification === "RED") {
    const msg = await prisma.message.create({
      data: {
        conversationId: convId,
        role: "ASSISTANT",
        content: "This portal only supports offer-related questions. Please ask about your benefits, equity, compensation, or other offer details.",
        classification: "RED",
      },
    });
    return NextResponse.json({ message: msg, conversationId: convId, classification: "RED" });
  }

  if (classification.classification === "YELLOW") {
    const aiRec = await generateEscalationRecommendation(question, classification.category);

    const msg = await prisma.message.create({
      data: {
        conversationId: convId,
        role: "ASSISTANT",
        content: "Thank you for your question. Your recruiter has been notified and will respond shortly.",
        classification: "YELLOW",
      },
    });

    await prisma.escalation.create({
      data: {
        candidateId,
        messageId: userMessage.id,
        question,
        category: classification.category,
        priority: "MEDIUM",
        aiRecommendation: aiRec,
      },
    });

    try {
      await sendEscalationNotification("hr@acme.com", candidate.name, candidateId, question, classification.category);
    } catch {
      console.error("Escalation notification failed");
    }

    return NextResponse.json({ message: msg, conversationId: convId, classification: "YELLOW" });
  }

  // GREEN — retrieve documents and answer
  const docChunks: Array<{ fileId: string; fileName: string; content: string }> = [];

  try {
    // Always load common docs — they contain policies relevant to most questions
    const commonDocs = await getCommonDocuments();
    console.log("[box] common docs found:", commonDocs.map((d: { name: string }) => d.name));

    for (const doc of commonDocs.slice(0, 5)) {
      try {
        const content = await getFileContent(doc.id, doc.name);
        const text = content.trim();
        if (text.length > 50) {
          docChunks.push({ fileId: doc.id, fileName: doc.name, content: text.slice(0, 6000) });
          console.log("[box] loaded", doc.name, "—", text.length, "chars");
        } else {
          console.warn("[box] skipped", doc.name, "— too short after parse");
        }
      } catch (e) {
        console.error("[box] failed to read", doc.name, e);
      }
    }

    // Also load candidate-specific docs
    if (candidate.boxFolderId) {
      const candidateDocs = await getCandidateDocuments(candidate.boxFolderId);
      console.log("[box] candidate docs found:", candidateDocs.map((d: { name: string }) => d.name));

      for (const doc of candidateDocs.slice(0, 5)) {
        try {
          const content = await getFileContent(doc.id, doc.name);
          const text = content.trim();
          if (text.length > 50) {
            docChunks.push({ fileId: doc.id, fileName: doc.name, content: text.slice(0, 6000) });
            console.log("[box] loaded candidate doc", doc.name, "—", text.length, "chars");
          }
        } catch (e) {
          console.error("[box] failed to read candidate doc", doc.name, e);
        }
      }
    }
  } catch (error) {
    console.error("[box] document retrieval error:", error);
  }

  console.log("[rag] total doc chunks:", docChunks.length);

  const result = await answerFromDocuments(question, docChunks);

  const msg = await prisma.message.create({
    data: {
      conversationId: convId,
      role: "ASSISTANT",
      content: result.answer,
      sources: result.sources,
      confidence: result.confidence,
      classification: "GREEN",
    },
  });

  await prisma.auditLog.create({
    data: {
      candidateId,
      question,
      documentsUsed: docChunks.map((d) => d.fileName),
      sourcesReturned: result.sources,
      confidence: result.confidence,
      escalated: false,
      classification: "GREEN",
    },
  });

  return NextResponse.json({ message: msg, conversationId: convId, classification: "GREEN" });
}
