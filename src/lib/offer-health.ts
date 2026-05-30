import OpenAI from "openai";

export interface HealthFactor {
  label: string;
  score: number;        // 0–100 contribution for this factor
  weight: number;       // 0.0–1.0
  detail: string;       // one-line AI reasoning
  direction: "good" | "neutral" | "bad";
}

export interface OfferHealthResult {
  score: number;                // 0–100 final
  label: "Excellent" | "Good" | "At Risk" | "Critical";
  color: "green" | "amber" | "red";
  factors: HealthFactor[];
  recommendation: string;       // one specific action HR should take
  aiReasoning: string;          // paragraph explaining the overall read
  computedAt: string;
}

export interface HealthInputs {
  candidateName: string;
  role: string;
  status: string;
  daysSinceOffer: number;
  escalations: {
    question: string;
    category: string;
    priority: string;
    status: string;
    createdAt: string;
  }[];
  activities: {
    type: string;
    description: string;
    createdAt: string;
  }[];
}

export async function computeOfferHealth(inputs: HealthInputs): Promise<OfferHealthResult> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are an expert recruiter analyst assessing whether a job offer is likely to close successfully.

You will be given signals about a candidate's behavior since receiving their offer. Assess the overall offer health on a 0–100 scale.

## Scoring Rubric
- **80–100 Excellent**: Candidate is engaged, no major concerns, on track to accept
- **60–79 Good**: Minor concerns but manageable, some follow-up needed
- **35–59 At Risk**: Clear warning signs — silence, negotiation pressure, or multiple unresolved concerns
- **0–34 Critical**: High risk of losing the candidate — immediate action required

## Factors to Evaluate (score each 0–100)

1. **Escalation Risk** (weight: 0.30)
   - Are there open escalations? What are they *about*? (compensation negotiation = serious, PTO question = minor)
   - High-priority unresolved = big deduction. Multiple salary/equity escalations = very high risk.
   - Look at the *content* of questions, not just the count

2. **Candidate Engagement** (weight: 0.30)
   - Has the candidate logged in? Asked questions? Viewed documents?
   - Engagement = interest. Silence = shopping other offers.
   - Questions about equity vesting or growth = positive signal. No activity = bad signal.

3. **Time Pressure** (weight: 0.20)
   - How long since the offer was sent?
   - 0–3 days: normal. 4–7 days: monitor. 8–14 days: follow up needed. 14+ days: urgent.
   - Accepted/Declined candidates score 100/0 respectively regardless of other factors.

4. **Sentiment Signal** (weight: 0.20)
   - Read the actual questions asked. Do they signal excitement, concern, or comparison shopping?
   - "How does equity vesting work?" = curious, positive. "Can you increase my salary?" = negotiating, elevated risk.
   - "What is the remote work policy?" = routine. "What are my exit options?" = red flag.

## Critical Rules
- If status is ACCEPTED → score 100, label Excellent, stop scoring
- If status is DECLINED → score 0, label Critical, stop scoring
- If candidate has NEVER logged in and offer is 5+ days old → cap score at 60
- If there are HIGH priority open escalations about compensation → cap score at 55
- Never fabricate activity that wasn't in the input data

Return JSON:
{
  "score": 0-100,
  "label": "Excellent" | "Good" | "At Risk" | "Critical",
  "factors": [
    {
      "label": "Escalation Risk",
      "score": 0-100,
      "weight": 0.30,
      "detail": "one-line AI reasoning specific to this candidate",
      "direction": "good" | "neutral" | "bad"
    },
    {
      "label": "Candidate Engagement",
      "score": 0-100,
      "weight": 0.30,
      "detail": "...",
      "direction": "..."
    },
    {
      "label": "Time Pressure",
      "score": 0-100,
      "weight": 0.20,
      "detail": "...",
      "direction": "..."
    },
    {
      "label": "Sentiment Signal",
      "score": 0-100,
      "weight": 0.20,
      "detail": "...",
      "direction": "..."
    }
  ],
  "recommendation": "One specific action the recruiter should take this week",
  "aiReasoning": "2-3 sentence paragraph explaining the overall read on this candidate"
}`,
      },
      {
        role: "user",
        content: JSON.stringify(inputs, null, 2),
      },
    ],
    response_format: { type: "json_object" },
  });

  const result = JSON.parse(response.choices[0].message.content!);

  // Derive color from label
  const colorMap: Record<string, "green" | "amber" | "red"> = {
    Excellent: "green",
    Good: "amber",
    "At Risk": "amber",
    Critical: "red",
  };

  return {
    score: result.score,
    label: result.label,
    color: colorMap[result.label] ?? "amber",
    factors: result.factors,
    recommendation: result.recommendation,
    aiReasoning: result.aiReasoning,
    computedAt: new Date().toISOString(),
  };
}
