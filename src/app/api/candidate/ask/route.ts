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

  // GREEN — strict document retrieval based on classification scope
  // common scope  → only company docs (no candidate data leakage)
  // candidate scope → only this candidate's docs (no cross-candidate leakage)
  // both scope → company docs + this candidate's docs only

  type DocChunk = { fileId: string; fileName: string; content: string; source: "common" | "candidate" };
  const docChunks: DocChunk[] = [];
  const READABLE = /\.(pdf|docx|doc|txt|md|csv)$/i;

  async function loadDocs(
    docs: { id: string; name: string }[],
    source: "common" | "candidate",
    maxChars = 8000
  ) {
    for (const doc of docs.filter((d) => READABLE.test(d.name))) {
      try {
        const content = (await getFileContent(doc.id, doc.name)).trim();
        if (content.length > 50) {
          docChunks.push({ fileId: doc.id, fileName: doc.name, content: content.slice(0, maxChars), source });
          console.log(`[rag] loaded ${source} doc: ${doc.name} (${content.length} chars)`);
        }
      } catch (e) {
        console.error(`[rag] failed to read ${source} doc ${doc.name}:`, e);
      }
    }
  }

  try {
    const scope = classification.documentScope;

    if (scope === "common" || scope === "both") {
      const allCommon = await getCommonDocuments();
      await loadDocs(allCommon as unknown as { id: string; name: string }[], "common");
    }

    if ((scope === "candidate" || scope === "both") && candidate.boxFolderId) {
      // Strict: only load from THIS candidate's folder
      const allCandidate = await getCandidateDocuments(candidate.boxFolderId);
      await loadDocs(allCandidate as unknown as { id: string; name: string }[], "candidate", 6000);
    }

    console.log(`[rag] scope=${scope} | loaded ${docChunks.length} docs (${docChunks.filter(d => d.source === "common").length} common, ${docChunks.filter(d => d.source === "candidate").length} candidate)`);
  } catch (error) {
    console.error("[rag] document retrieval error:", error);
  }

  const result = await answerFromDocuments(question, docChunks);

  // If AI couldn't find the answer, auto-escalate to HR — candidate shouldn't be left hanging
  const couldNotAnswer =
    result.confidence < 0.3 ||
    result.answer.toLowerCase().includes("couldn't find") ||
    result.answer.toLowerCase().includes("could not find") ||
    result.answer.toLowerCase().includes("not found in the documents") ||
    result.answer.toLowerCase().includes("confirm with hr") ||
    result.answer.toLowerCase().includes("confirm this with");

  if (couldNotAnswer) {
    const aiRec = await generateEscalationRecommendation(question, classification.category);

    // Replace the "I don't know" message with an escalation message
    const msg = await prisma.message.create({
      data: {
        conversationId: convId,
        role: "ASSISTANT",
        content: "I couldn't find a clear answer in your documents. Your recruiter has been notified and will respond shortly.",
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
        aiRecommendation: `AI could not answer from documents. ${aiRec}`,
      },
    });

    try {
      await sendEscalationNotification("hr@acme.com", candidate.name, candidateId, question, classification.category);
    } catch {
      console.error("Escalation notification failed");
    }

    console.log(`[rag] auto-escalated unanswerable question: "${question}"`);
    return NextResponse.json({ message: msg, conversationId: convId, classification: "YELLOW" });
  }

  const msg = await prisma.message.create({
    data: {
      conversationId: convId,
      role: "ASSISTANT",
      content: result.answer,
      sources: result.sources,
      confidence: result.confidence,
      classification: classification.classification === "GREEN_FLAG" ? "GREEN_FLAG" : "GREEN",
    },
  });

  const isFlagged = classification.classification === "GREEN_FLAG";

  // GREEN_FLAG: answer was given, but also create a LOW-priority escalation
  // so HR can see the candidate is asking concern-signal questions
  if (isFlagged) {
    const flagNote = classification.flagReason
      ? `Concern signal: ${classification.flagReason}`
      : `Candidate asked about "${classification.category}" — may signal doubt or comparison shopping.`;

    await prisma.escalation.create({
      data: {
        candidateId,
        messageId: userMessage.id,
        question,
        category: `⚑ Concern signal: ${classification.category}`,
        priority: "LOW",
        aiRecommendation: flagNote,
      },
    });

    console.log(`[rag] GREEN_FLAG escalation created for "${question}"`);
  }

  await prisma.auditLog.create({
    data: {
      candidateId,
      question,
      documentsUsed: docChunks.map((d) => d.fileName),
      sourcesReturned: result.sources,
      confidence: result.confidence,
      escalated: isFlagged,
      classification: isFlagged ? "GREEN" : "GREEN",
    },
  });

  return NextResponse.json({ message: msg, conversationId: convId, classification: isFlagged ? "GREEN_FLAG" : "GREEN" });
}
