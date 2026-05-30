import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { classifyQuestion, generateEscalationRecommendation } from "@/lib/openai";
import { getCommonDocuments, getCandidateDocuments, askBoxAI } from "@/lib/box";
import { sendEscalationNotification } from "@/lib/resend";

const READABLE = /\.(pdf|docx|doc|txt|md|csv)$/i;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { candidateId, question, conversationId } = body;

  if (!candidateId || !question) {
    return NextResponse.json({ error: "candidateId and question are required" }, { status: 400 });
  }

  const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
  if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });

  // Get or create conversation
  let convId = conversationId;
  if (!convId) {
    const conv = await prisma.conversation.create({ data: { candidateId } });
    convId = conv.id;
  }

  const userMessage = await prisma.message.create({
    data: { conversationId: convId, role: "USER", content: question },
  });

  await prisma.candidateActivity.create({
    data: { candidateId, type: "QUESTION", description: question },
  });

  // Classify question
  const classification = await classifyQuestion(question);
  console.log("[classify]", question, "→", classification.classification, classification.documentScope);

  // RED — out of scope
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

  // YELLOW — escalate, no AI answer
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
      data: { candidateId, messageId: userMessage.id, question, category: classification.category, priority: "MEDIUM", aiRecommendation: aiRec },
    });
    try {
      await sendEscalationNotification("hr@acme.com", candidate.name, candidateId, question, classification.category);
    } catch { console.error("Escalation notification failed"); }

    return NextResponse.json({ message: msg, conversationId: convId, classification: "YELLOW" });
  }

  // GREEN / GREEN_FLAG — answer via Box AI
  // Strict scope: common | candidate | both — no cross-candidate leakage
  const fileIds: string[] = [];
  const fileNames: Record<string, string> = {};

  try {
    const scope = classification.documentScope;

    if (scope === "common" || scope === "both") {
      const docs = (await getCommonDocuments()) as { id: string; name: string; type: string }[];
      docs.filter((d) => READABLE.test(d.name)).forEach((d) => {
        fileIds.push(d.id);
        fileNames[d.id] = d.name;
      });
    }

    if ((scope === "candidate" || scope === "both") && candidate.boxFolderId) {
      const docs = (await getCandidateDocuments(candidate.boxFolderId)) as { id: string; name: string; type: string }[];
      docs.filter((d) => READABLE.test(d.name)).forEach((d) => {
        fileIds.push(d.id);
        fileNames[d.id] = d.name;
      });
    }

    console.log(`[box-ai] scope=${scope} | files: [${Object.values(fileNames).join(", ")}]`);
  } catch (error) {
    console.error("[box-ai] file list error:", error);
  }

  // Ask Box AI
  const result = await askBoxAI(question, fileIds, fileNames);

  // If Box AI couldn't answer, auto-escalate
  const couldNotAnswer =
    fileIds.length === 0 ||
    result.completionReason === "no_documents" ||
    result.answer.toLowerCase().includes("i don't have") ||
    result.answer.toLowerCase().includes("i do not have") ||
    result.answer.toLowerCase().includes("couldn't find") ||
    result.answer.toLowerCase().includes("not available") ||
    result.answer.trim().length < 20;

  if (couldNotAnswer) {
    const aiRec = await generateEscalationRecommendation(question, classification.category);
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
        aiRecommendation: `Box AI could not answer from documents. ${aiRec}`,
      },
    });
    try {
      await sendEscalationNotification("hr@acme.com", candidate.name, candidateId, question, classification.category);
    } catch { console.error("Escalation notification failed"); }

    console.log(`[box-ai] auto-escalated unanswerable: "${question}"`);
    return NextResponse.json({ message: msg, conversationId: convId, classification: "YELLOW" });
  }

  const isFlagged = classification.classification === "GREEN_FLAG";

  const sources = result.sources.map((s) => ({ fileName: s.fileName, fileId: s.fileId }));

  const msg = await prisma.message.create({
    data: {
      conversationId: convId,
      role: "ASSISTANT",
      content: result.answer,
      sources,
      confidence: 0.9, // Box AI doesn't return a confidence score
      classification: isFlagged ? "GREEN_FLAG" : "GREEN",
    },
  });

  // GREEN_FLAG: answered but create a low-priority concern signal for HR
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
    console.log(`[box-ai] GREEN_FLAG escalation for "${question}"`);
  }

  await prisma.auditLog.create({
    data: {
      candidateId,
      question,
      documentsUsed: Object.values(fileNames),
      sourcesReturned: sources,
      confidence: 0.9,
      escalated: isFlagged,
      classification: "GREEN",
    },
  });

  return NextResponse.json({ message: msg, conversationId: convId, classification: isFlagged ? "GREEN_FLAG" : "GREEN" });
}
