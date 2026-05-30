import OpenAI from "openai";

let _client: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

export type QuestionClass = "GREEN" | "GREEN_FLAG" | "YELLOW" | "RED";

export interface ClassificationResult {
  classification: QuestionClass;
  category: string;
  documentScope: "common" | "candidate" | "both";
  reasoning: string;
  flagReason?: string; // only set for GREEN_FLAG — why this needs HR visibility
}

export async function classifyQuestion(question: string): Promise<ClassificationResult> {
  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a question classifier for a job offer portal. Classify candidate questions into one of four categories:

GREEN: AI answers from documents. No HR notification needed.
- What their offer says (start date, salary, bonus, equity, title)
- Standard company policies: PTO, benefits, health insurance, 401k, vesting, remote work
- How things work: how RSUs vest, what the bonus structure is
- Meta questions: "what documents do you have", "what can you help me with"

GREEN_FLAG: AI answers from documents, BUT also creates a low-priority HR alert.
Use this when the question itself signals candidate anxiety, doubt, or comparison shopping — even if it's factually answerable.
Examples of concern-signal questions:
- PIP / performance improvement plan policy → signals job security fear
- Attrition rate / employee turnover → signals doubt about company stability
- Layoff history or policy → signals fear of job loss
- Why did the last person in this role leave? → red flag question
- How long do people typically stay in this role? → retention concern
- What happens to my equity if the company is acquired? → exit scenario planning
- Non-compete / non-solicitation clauses → lawyer-mode thinking
- Clawback policy / repayment clauses → distrust signal
- How often do people get promoted here? → comparison shopping
- Is this role likely to be outsourced or automated? → existential concern
The candidate deserves an answer, but HR should know they're asking.

YELLOW: Human HR review only. AI does NOT answer.
- Requests to CHANGE or NEGOTIATE: "can you increase my salary", "I want more equity", "move my start date"
- Requests for exceptions or special treatment
- Questions only HR can personally decide

RED: Completely out of scope.
- Politics, sports, general knowledge, anything unrelated to employment

KEY RULES:
- Asking WHAT = GREEN (or GREEN_FLAG if it's a concern signal)
- Asking to CHANGE = YELLOW
- "What is my salary?" → GREEN. "Can you increase my salary?" → YELLOW.
- "What's the PIP policy?" → GREEN_FLAG (answerable + signals anxiety)
- "What's the attrition rate?" → GREEN_FLAG (answerable + signals doubt)

documentScope:
- "common": general company policy
- "candidate": specific to this candidate's offer
- "both": needs both

Respond with JSON only:
{
  "classification": "GREEN"|"GREEN_FLAG"|"YELLOW"|"RED",
  "category": "topic label",
  "documentScope": "common"|"candidate"|"both",
  "reasoning": "brief explanation",
  "flagReason": "only for GREEN_FLAG — one sentence on why HR should see this"
}`,
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
