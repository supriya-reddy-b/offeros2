/**
 * AI layer — powered by Claude via AWS Bedrock
 * All LLM calls route through bedrock.ts → Claude 3.5 Sonnet / Haiku
 */
import { askClaude } from "./bedrock";

export type QuestionClass = "GREEN" | "GREEN_FLAG" | "YELLOW" | "RED";

export interface ClassificationResult {
  classification: QuestionClass;
  category: string;
  documentScope: "common" | "candidate" | "both";
  reasoning: string;
  flagReason?: string;
}

export async function classifyQuestion(question: string): Promise<ClassificationResult> {
  const result = await askClaude(
    question,
    `You are a question classifier for a job offer portal. Classify candidate questions into one of four categories:

GREEN: AI answers from documents. No HR notification needed.
- What their offer says (start date, salary, bonus, equity, title)
- Standard company policies: PTO, benefits, health insurance, 401k, vesting, remote work
- How things work: how RSUs vest, what the bonus structure is
- Meta questions: "what documents do you have", "what can you help me with"

GREEN_FLAG: AI answers from documents, BUT also creates a low-priority HR alert.
Use when the question signals candidate anxiety, doubt, or comparison shopping:
- PIP / performance improvement plan policy → job security fear
- Attrition rate / employee turnover → doubt about stability
- Layoff history or policy → fear of job loss
- Why did the last person in this role leave?
- Non-compete / non-solicitation clauses → lawyer-mode
- Clawback policy / repayment clauses → distrust signal
- What happens to equity if company is acquired? → exit planning

YELLOW: Human HR review only. AI does NOT answer.
- Requests to CHANGE or NEGOTIATE: "can you increase my salary", "I want more equity"
- Requests for exceptions or special treatment

RED: Completely out of scope — politics, sports, general knowledge unrelated to employment.

KEY RULES:
- Asking WHAT = GREEN (or GREEN_FLAG if concern signal)
- Asking to CHANGE = YELLOW
- "What is my salary?" → GREEN. "Can you increase my salary?" → YELLOW.

documentScope:
- "common": general company policy
- "candidate": specific to this candidate's offer
- "both": needs both

Return JSON only:
{
  "classification": "GREEN"|"GREEN_FLAG"|"YELLOW"|"RED",
  "category": "topic label",
  "documentScope": "common"|"candidate"|"both",
  "reasoning": "brief explanation",
  "flagReason": "only for GREEN_FLAG — one sentence on why HR should see this"
}`,
    { fast: true, jsonMode: true }
  );

  return JSON.parse(result) as ClassificationResult;
}

export async function generateEscalationRecommendation(question: string, category: string): Promise<string> {
  return askClaude(
    `Category: ${category}\nQuestion: ${question}`,
    "You are an HR advisor. Given a candidate question that requires human review, provide a brief recommended response approach for the HR team. Be concise (1-2 sentences). Do not make promises about specific numbers.",
    { fast: true }
  );
}

export async function generateCandidateBrief(candidateData: {
  name: string;
  role: string;
  questions: string[];
  escalations: string[];
  documentsViewed: string[];
  intelligence?: { interests?: string[]; recentActivity?: string[] };
}): Promise<string> {
  return askClaude(
    JSON.stringify(candidateData),
    "You are an HR intelligence assistant. Generate a concise candidate brief for a recruiter to use before a call. Focus on: top concerns, engagement signals, and specific recruiter actions. Be direct and actionable. Format as clean paragraphs, no headers needed.",
    { maxTokens: 512 }
  );
}

// Legacy export — Box AI handles document Q&A now, but keeping for fallback
export interface DocumentChunk {
  fileId: string;
  fileName: string;
  content: string;
}

export async function answerFromDocuments(
  question: string,
  documents: DocumentChunk[]
): Promise<{ answer: string; sources: { fileName: string; fileId: string }[]; confidence: number }> {
  if (documents.length === 0) {
    return { answer: "I couldn't find a clear answer in the documents provided.", sources: [], confidence: 0.1 };
  }

  const context = documents
    .map((d) => `[Document: ${d.fileName}]\n${d.content}`)
    .join("\n\n---\n\n");

  const result = await askClaude(
    `Documents:\n${context}\n\nQuestion: ${question}`,
    `You are an AI assistant helping a job candidate understand their offer. Answer based ONLY on the provided documents.
- Be clear and direct
- If not in documents, say "I couldn't find a clear answer in the documents provided"
- Never make up information

Respond with JSON: { "answer": "your answer", "sources": [{"fileName": "...", "fileId": "..."}], "confidence": 0.0-1.0 }`,
    { jsonMode: true }
  );

  return JSON.parse(result);
}
