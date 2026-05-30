import OpenAI from "openai";

let _client: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

export type QuestionClass = "GREEN" | "YELLOW" | "RED";

export interface ClassificationResult {
  classification: QuestionClass;
  category: string;
  documentScope: "common" | "candidate" | "both";
  reasoning: string;
}

export async function classifyQuestion(question: string): Promise<ClassificationResult> {
  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a question classifier for a job offer portal. Classify candidate questions into:

GREEN: AI can answer by reading documents. This includes:
- Reading/asking WHAT their offer says (start date, salary, bonus, equity grant, title, role details)
- General company policies: PTO, benefits, health insurance, 401k, equity vesting schedule, career framework, remote work
- How things work: how vesting works, what RSUs are, how the bonus is calculated
- Any factual question that can be answered by looking at offer documents

YELLOW: Requires human HR review. ONLY use this for:
- Requests to CHANGE or NEGOTIATE something (e.g. "can you increase my salary", "I want more equity", "can we move my start date")
- Requests for exceptions or special treatment
- Questions HR must personally decide (not just read from a doc)

RED: Out of scope entirely. Examples: politics, sports, general knowledge, anything unrelated to employment.

KEY RULE: Asking WHAT something is = GREEN. Asking to CHANGE something = YELLOW.
Also GREEN: meta questions like "what documents do you have", "what can you help me with", "what information is available".
"What is my salary?" → GREEN. "Can you increase my salary?" → YELLOW.
"What is my start date?" → GREEN. "Can we change my start date?" → YELLOW.

Also determine documentScope:
- "common": general company policy question (benefits, PTO, equity policy, career framework)
- "candidate": specific to this candidate's offer (their salary, their start date, their equity grant)
- "both": could need both

Respond with JSON only: { "classification": "GREEN"|"YELLOW"|"RED", "category": "string describing the topic", "documentScope": "common"|"candidate"|"both", "reasoning": "brief explanation" }`,
      },
      { role: "user", content: question },
    ],
    response_format: { type: "json_object" },
  });

  return JSON.parse(response.choices[0].message.content!) as ClassificationResult;
}

export interface DocumentChunk {
  fileId: string;
  fileName: string;
  content: string;
  pageOrSection?: string;
}

export async function answerFromDocuments(
  question: string,
  documents: DocumentChunk[]
): Promise<{ answer: string; sources: Array<{ fileName: string; fileId: string; section?: string }>; confidence: number }> {
  const openai = getOpenAI();
  const context = documents
    .map((d) => `[Document: ${d.fileName}${d.pageOrSection ? ` - ${d.pageOrSection}` : ""}]\n${d.content}`)
    .join("\n\n---\n\n");

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are an AI assistant helping a job candidate understand their offer. Answer questions based ONLY on the provided documents.

Rules:
- Be clear and direct
- Cite specific documents when possible
- If the answer is not in the documents, say "I couldn't find a clear answer in the documents provided" and suggest confirming with HR
- Never make up information
- Keep answers concise (2-4 sentences typically)

Respond with JSON: { "answer": "your answer", "sources": [{"fileName": "...", "fileId": "...", "section": "optional section/page"}], "confidence": 0.0-1.0 }`,
      },
      {
        role: "user",
        content: `Documents:\n${context}\n\nQuestion: ${question}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  return JSON.parse(response.choices[0].message.content!);
}

export async function generateCandidateBrief(candidateData: {
  name: string;
  role: string;
  questions: string[];
  escalations: string[];
  documentsViewed: string[];
  intelligence?: { interests?: string[]; recentActivity?: string[] };
}): Promise<string> {
  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content:
          "You are an HR intelligence assistant. Generate a concise candidate brief for a recruiter to use before a call. Focus on: top concerns, engagement signals, and specific recruiter actions. Be direct and actionable. Format as clean paragraphs, no headers needed.",
      },
      {
        role: "user",
        content: JSON.stringify(candidateData),
      },
    ],
  });

  return response.choices[0].message.content!;
}

export async function generateEscalationRecommendation(question: string, category: string): Promise<string> {
  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are an HR advisor. Given a candidate question that requires human review, provide a brief recommended response approach for the HR team. Be concise (2-3 sentences). Do not make promises about specific numbers.",
      },
      {
        role: "user",
        content: `Category: ${category}\nQuestion: ${question}`,
      },
    ],
  });

  return response.choices[0].message.content!;
}
