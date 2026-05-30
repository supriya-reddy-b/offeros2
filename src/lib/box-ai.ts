/**
 * Box AI — intelligent document processing
 *
 * Three capabilities beyond basic Q&A:
 * 1. extractOfferTerms    — pull structured data from any offer letter
 * 2. checkDocumentHealth  — validate completeness before sending to candidate
 * 3. summarizeDocument    — one-paragraph summary for HR quick read
 *
 * All calls use Box AI natively — no external LLM needed for doc processing.
 */

let runtimeToken: string = process.env.BOX_DEVELOPER_TOKEN ?? "";

export function setBoxAIToken(token: string) {
  runtimeToken = token;
}

async function boxAIRequest(endpoint: string, body: object) {
  const res = await fetch(`https://api.box.com/2.0${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${runtimeToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Box AI ${endpoint} → ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── 1. Extract offer terms ───────────────────────────────────────────────────

export interface OfferTerms {
  candidateName?: string;
  role?: string;
  startDate?: string;
  baseSalary?: string;
  signingBonus?: string;
  equityGrant?: string;
  vestingSchedule?: string;
  location?: string;
  reportsTo?: string;
  offerExpiry?: string;
  raw: Record<string, string>;
}

export async function extractOfferTerms(fileId: string): Promise<OfferTerms> {
  const fields = [
    "candidate full name",
    "job title / role",
    "start date",
    "base salary (annual)",
    "signing bonus",
    "equity grant (shares or percentage)",
    "vesting schedule",
    "work location",
    "reports to (manager name)",
    "offer expiry date",
  ];

  const prompt = `Extract the following information from this offer letter document.
For each field, return the exact value from the document or "Not specified" if absent.
Return as JSON with these exact keys: ${fields.map((f, i) => `"field${i + 1}"`).join(", ")}
And these exact labels: ${fields.join(", ")}

Format: { "candidateName": "...", "role": "...", "startDate": "...", "baseSalary": "...", "signingBonus": "...", "equityGrant": "...", "vestingSchedule": "...", "location": "...", "reportsTo": "...", "offerExpiry": "..." }`;

  const data = await boxAIRequest("/ai/ask", {
    mode: "single_item_qa",
    prompt,
    items: [{ type: "file", id: fileId }],
  });

  let parsed: Record<string, string> = {};
  try {
    // Box AI returns natural language — try to parse JSON from the answer
    const match = data.answer?.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
  } catch {
    // fallback: parse line by line
    const lines = (data.answer ?? "").split("\n");
    for (const line of lines) {
      const [key, ...rest] = line.split(":");
      if (key && rest.length) parsed[key.trim().toLowerCase().replace(/\s+/g, "")] = rest.join(":").trim();
    }
  }

  console.log(`[box-ai] extracted offer terms from file ${fileId}`);

  return {
    candidateName: parsed.candidateName || parsed.candidate_name,
    role: parsed.role || parsed.jobtitle,
    startDate: parsed.startDate || parsed.start_date,
    baseSalary: parsed.baseSalary || parsed.base_salary,
    signingBonus: parsed.signingBonus || parsed.signing_bonus,
    equityGrant: parsed.equityGrant || parsed.equity_grant,
    vestingSchedule: parsed.vestingSchedule || parsed.vesting_schedule,
    location: parsed.location,
    reportsTo: parsed.reportsTo || parsed.reports_to,
    offerExpiry: parsed.offerExpiry || parsed.offer_expiry,
    raw: parsed,
  };
}

// ─── 2. Document health check ─────────────────────────────────────────────────

export interface DocumentHealth {
  score: number;                // 0–100
  status: "complete" | "incomplete" | "missing_critical";
  present: string[];            // sections found
  missing: string[];            // sections not found
  warnings: string[];           // present but potentially problematic
  recommendation: string;
}

export async function checkDocumentHealth(fileId: string, docType: string): Promise<DocumentHealth> {
  const requiredSections: Record<string, string[]> = {
    OFFER_LETTER: [
      "start date",
      "base salary or compensation",
      "job title or role",
      "employment type (full-time/part-time)",
      "reporting structure or manager",
      "offer acceptance deadline or expiry",
      "at-will employment statement",
      "benefits summary or reference",
    ],
    EQUITY_GRANT: [
      "number of shares or grant amount",
      "strike price or exercise price",
      "vesting schedule",
      "cliff period",
      "grant date",
      "plan name (e.g. 2022 Equity Incentive Plan)",
      "option type (ISO or NSO)",
      "expiry date",
    ],
    COMPENSATION_BREAKDOWN: [
      "base salary",
      "bonus structure or target",
      "equity component",
      "total compensation estimate",
      "pay frequency",
    ],
  };

  const required = requiredSections[docType] ?? requiredSections.OFFER_LETTER;

  const data = await boxAIRequest("/ai/ask", {
    mode: "single_item_qa",
    prompt: `You are reviewing a ${docType.replace(/_/g, " ").toLowerCase()} document for completeness.

Check whether each of these sections/fields is present and clearly stated:
${required.map((r, i) => `${i + 1}. ${r}`).join("\n")}

Also flag any sections that are present but vague, missing specific values, or potentially problematic.

Respond with JSON:
{
  "present": ["section names that are clearly present"],
  "missing": ["section names that are completely absent"],
  "warnings": ["sections present but vague or problematic, with brief note"],
  "recommendation": "one sentence on overall completeness"
}`,
    items: [{ type: "file", id: fileId }],
  });

  let parsed = { present: [] as string[], missing: [] as string[], warnings: [] as string[], recommendation: "" };
  try {
    const match = data.answer?.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
  } catch {
    console.warn("[box-ai] health check parse failed, using raw answer");
    parsed.recommendation = data.answer ?? "Could not assess document health.";
  }

  const score = Math.round(
    ((parsed.present.length) / required.length) * 100 -
    parsed.warnings.length * 5
  );

  const clampedScore = Math.max(0, Math.min(100, score));
  const status = clampedScore >= 80 ? "complete" : clampedScore >= 50 ? "incomplete" : "missing_critical";

  console.log(`[box-ai] health check: ${docType} → ${clampedScore}/100 (${status})`);

  return {
    score: clampedScore,
    status,
    present: parsed.present,
    missing: parsed.missing,
    warnings: parsed.warnings,
    recommendation: parsed.recommendation,
  };
}

// ─── 3. Document summary ──────────────────────────────────────────────────────

export async function summarizeDocument(fileId: string, fileName: string): Promise<string> {
  const data = await boxAIRequest("/ai/text_gen", {
    prompt: `Write a concise 2-3 sentence summary of this document for an HR recruiter. Focus on what it covers and any key numbers or dates. Be factual, no filler.`,
    items: [{ type: "file", id: fileId, content: "" }],
  });

  console.log(`[box-ai] summarized ${fileName}`);
  return data.answer ?? "";
}

// ─── 4. Write metadata back to Box file ──────────────────────────────────────

export async function writeBoxMetadata(
  fileId: string,
  terms: OfferTerms,
  health: DocumentHealth,
  docType: string
) {
  // Box metadata template key we created earlier
  const templateKey = "offerDocument";
  const scope = "enterprise";

  const metadata: Record<string, string | number> = {
    docType,
    healthStatus: health.status,
    missingFields: health.missing.join(", ") || "none",
  };

  if (terms.candidateName) metadata.candidateName = terms.candidateName;
  if (terms.role) metadata.role = terms.role;
  if (terms.startDate) metadata.startDate = terms.startDate;
  if (terms.baseSalary) {
    const num = parseFloat(terms.baseSalary.replace(/[^0-9.]/g, ""));
    if (!isNaN(num)) metadata.baseSalary = num;
  }
  if (terms.equityGrant) metadata.equityGrant = terms.equityGrant;
  if (terms.signingBonus) {
    const num = parseFloat(terms.signingBonus.replace(/[^0-9.]/g, ""));
    if (!isNaN(num)) metadata.signingBonus = num;
  }

  try {
    // Try creating, fall back to updating if already exists
    const createRes = await fetch(
      `https://api.box.com/2.0/files/${fileId}/metadata/${scope}/${templateKey}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${runtimeToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(metadata),
      }
    );

    if (createRes.status === 409) {
      // Already exists — patch it
      const ops = Object.entries(metadata).map(([key, value]) => ({
        op: "replace", path: `/${key}`, value,
      }));
      await fetch(
        `https://api.box.com/2.0/files/${fileId}/metadata/${scope}/${templateKey}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${runtimeToken}`,
            "Content-Type": "application/json-patch+json",
          },
          body: JSON.stringify(ops),
        }
      );
    }

    console.log(`[box-ai] metadata written to file ${fileId}`);
  } catch (e) {
    console.warn("[box-ai] metadata write failed (non-fatal):", e);
  }
}
