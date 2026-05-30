import { askClaude } from "./bedrock";

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
  const raw = await askClaude(
    JSON.stringify(inputs, null, 2),
    `You are an expert recruiter analyst assessing whether a job offer is likely to close successfully.

You will be given signals about a candidate's behavior since receiving their offer. Assess the overall offer health on a 0–100 scale.

## Scoring Rubric
- 80–100 Excellent: Candidate is engaged, no major concerns, on track to accept
- 60–79 Good: Minor concerns but manageable, some follow-up needed
- 35–59 At Risk: Clear warning signs — silence, negotiation pressure, or multiple unresolved concerns
- 0–34 Critical: High risk of losing the candidate — immediate action required

## Factors to Evaluate (score each 0–100)
1. Escalation Risk (weight: 0.30) — content of questions matters, not just count
2. Candidate Engagement (weight: 0.30) — logins, questions, doc views
3. Time Pressure (weight: 0.20) — days since offer; 14+ days = urgent
4. Sentiment Signal (weight: 0.20) — read actual questions for excitement vs concern

## Critical Rules
- If status is ACCEPTED → score 100, label Excellent
- If status is DECLINED → score 0, label Critical
- If never logged in and offer is 5+ days old → cap score at 60
- If HIGH priority compensation escalation open → cap score at 55

Return JSON only:
{
  "score": 0-100,
  "label": "Excellent" | "Good" | "At Risk" | "Critical",
  "factors": [
    { "label": "Escalation Risk", "score": 0-100, "weight": 0.30, "detail": "one-line reasoning", "direction": "good"|"neutral"|"bad" },
    { "label": "Candidate Engagement", "score": 0-100, "weight": 0.30, "detail": "...", "direction": "..." },
    { "label": "Time Pressure", "score": 0-100, "weight": 0.20, "detail": "...", "direction": "..." },
    { "label": "Sentiment Signal", "score": 0-100, "weight": 0.20, "detail": "...", "direction": "..." }
  ],
  "recommendation": "One specific action the recruiter should take this week",
  "aiReasoning": "2-3 sentence paragraph explaining the overall read"
}`,
    { jsonMode: true }
  );

  const result = JSON.parse(raw);

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
