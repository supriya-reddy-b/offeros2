import { ApifyClient } from "apify-client";
import { askClaude } from "./bedrock";

const apify = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

export interface CompetitorData {
  company: string;
  equivalentLevel?: string;
  salaryRange?: { min: number; max: number; currency: string };
  rating?: number;
  reviewHighlights?: string[];
  topPerks?: string[];
}

export interface CompetitorIntelligenceResult {
  role: string;
  competitors: CompetitorData[];
  salaryBenchmarks: { low: number; median: number; high: number; currency: string; source: string };
  jobPostings: { company: string; title: string; location: string; url?: string }[];
  glassdoorData: { company: string; rating: number; reviewSnippets: string[] }[];
  positioningAdvice: { strengths: string[]; watchouts: string[]; talkingPoints: string[]; salaryPosition: string };
  sources: string[];
}

// Dynamically pick fintech competitors based on BOTH role type AND seniority level
async function getCompetitors(role: string): Promise<{ competitors: string[]; levels: Record<string, string> }> {
  const raw = await askClaude(
    `Role: ${role}`,
    `You are a fintech talent market expert. Given a job role at Acme (a Series C fintech startup in payments/financial infrastructure), identify the 6 most relevant competitor companies AND the equivalent level at each company.

Rules:
- Only fintech companies (payments, banking, crypto, expense mgmt, lending, compliance tech)
- Match FUNCTION and SENIORITY, infer equivalent level at each competitor
- Level examples: "Senior Engineer" → Stripe L4, Coinbase E4; "Staff Engineer" → Stripe L5, Coinbase E5; "Director" → Stripe L7, Coinbase Director
- Senior/director+: include larger fintechs (Stripe, PayPal, Coinbase)
- IC/mid-level: weight toward same-stage (Brex, Ramp, Plaid, Chime, Marqeta)
- Never include non-fintech companies

Return JSON only: {
  "competitors": ["Company1", "Company2", "Company3", "Company4", "Company5", "Company6"],
  "levels": { "Company1": "L5", "Company2": "E5", "Company3": "Senior" },
  "reasoning": "one line why"
}`,
    { fast: true, jsonMode: true }
  );

  const result = JSON.parse(raw);
  console.log(`[competitor] AI-picked for "${role}": ${result.competitors.join(", ")} — ${result.reasoning}`);
  // Attach levels to competitor names so the rest of the pipeline can use them
  return { competitors: result.competitors as string[], levels: result.levels as Record<string, string> };
}

// ── Google Search via Apify (free, working) ───────────────────────────────────
async function scrapeGoogleSearch(queries: string[]): Promise<object[]> {
  try {
    console.log("[competitor] Google Search:", queries);
    const run = await apify.actor("apify/google-search-scraper").call({
      queries: queries.join("\n"),
      maxPagesPerQuery: 1,
      resultsPerPage: 5,
      mobileResults: false,
    }, { waitSecs: 60 });
    const { items } = await apify.dataset(run.defaultDatasetId).listItems();
    console.log(`[competitor] Google returned ${items.length} results`);
    return items;
  } catch (e) {
    console.warn("[competitor] Google scrape failed:", e);
    return [];
  }
}

// ── LinkedIn Profile Scraper for company pages (free) ─────────────────────────
async function scrapeLinkedInCompanies(companies: string[], role: string): Promise<object[]> {
  try {
    console.log("[competitor] LinkedIn company scrape for:", companies.slice(0, 3));
    const run = await apify.actor("2SyF0bVxmgGr8IVCZ").call({
      profileUrls: companies.slice(0, 3).map(c =>
        `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(role + " " + c)}&location=United%20States`
      ),
    }, { waitSecs: 60 });
    const { items } = await apify.dataset(run.defaultDatasetId).listItems();
    console.log(`[competitor] LinkedIn returned ${items.length} items`);
    return items;
  } catch (e) {
    console.warn("[competitor] LinkedIn scrape failed:", e);
    return [];
  }
}

// ── GitHub Jobs API (public, free) ────────────────────────────────────────────
async function fetchGitHubJobs(role: string, companies: string[]): Promise<object[]> {
  try {
    const results = [];
    for (const company of companies.slice(0, 4)) {
      const res = await fetch(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(company.toLowerCase())}+jobs+hiring&per_page=3`,
        { headers: { Accept: "application/vnd.github+json", "User-Agent": "OfferOS" } }
      );
      if (res.ok) {
        const data = await res.json();
        results.push({ company, repos: data.total_count });
      }
    }
    return results;
  } catch {
    return [];
  }
}

export async function collectCompetitorIntelligence(
  role: string,
  _candidateName: string
): Promise<CompetitorIntelligenceResult> {
  const { competitors, levels } = await getCompetitors(role);
  console.log(`[competitor] collecting intel for "${role}" vs [${competitors.join(", ")}]`);

  // Build targeted Google queries for maximum signal
  const googleQueries = [
    `${role} salary ${competitors.slice(0, 3).join(" OR ")} fintech 2025`,
    `${role} total compensation ${competitors.slice(0, 3).join(" OR ")} site:levels.fyi OR site:glassdoor.com OR site:blind.com`,
    `${role} equity offer Series C fintech ${competitors.slice(0, 3).join(" OR ")} 2025`,
    `${role} hiring ${competitors.slice(0, 4).join(" OR ")} fintech job openings 2025`,
  ];

  // Run Apify actors + GitHub in parallel
  const [googleResults, linkedinResults, githubResults] = await Promise.allSettled([
    scrapeGoogleSearch(googleQueries),
    scrapeLinkedInCompanies(competitors, role),
    fetchGitHubJobs(role, competitors),
  ]);

  const google = googleResults.status === "fulfilled" ? googleResults.value : [];
  const linkedin = linkedinResults.status === "fulfilled" ? linkedinResults.value : [];
  const github = githubResults.status === "fulfilled" ? githubResults.value : [];

  const sourcesUsed = [
    google.length > 0 ? `Google Search · ${google.length} results (Apify)` : null,
    linkedin.length > 0 ? `LinkedIn · ${linkedin.length} profiles (Apify)` : null,
    github.length > 0 ? `GitHub · ${github.length} signals` : null,
    "Claude (AWS Bedrock) synthesis",
  ].filter(Boolean) as string[];

  console.log(`[competitor] sources: ${sourcesUsed.join(", ")}`);

  // Synthesize with Claude on AWS Bedrock
  const aiRaw = await askClaude(
    JSON.stringify({ role, competitors, equivalentLevels: levels, googleSearchResults: google.slice(0, 8), linkedinData: linkedin.slice(0, 5), githubSignals: github }),
    `You are a competitive compensation intelligence analyst for Acme — a Series C fintech startup competing for talent against Stripe, Plaid, Brex, Ramp, Chime, Coinbase, and similar companies.

Your job: give the Acme recruiter intelligence they CANNOT get from the interview — only from the public market.

Acme context: Series C fintech, ~$500M raised, 300–600 employees, competitive base + meaningful equity, smaller than Stripe/PayPal but more equity leverage and faster career growth.

Use scraped data where available. Fill gaps with your knowledge of fintech compensation in 2024-2025.

Return JSON:
{
  "competitors": [{ "company": "Stripe", "equivalentLevel": "L5", "salaryRange": { "min": 180000, "max": 280000, "currency": "USD" }, "rating": 4.4, "reviewHighlights": ["..."], "topPerks": ["..."] }],
  "salaryBenchmarks": { "low": 150000, "median": 200000, "high": 300000, "currency": "USD", "source": "Glassdoor / levels.fyi 2025" },
  "jobPostings": [{ "company": "Stripe", "title": "...", "location": "Remote / SF" }],
  "glassdoorData": [{ "company": "Stripe", "rating": 4.4, "reviewSnippets": ["..."] }],
  "positioningAdvice": {
    "strengths": ["Acme-specific advantages"],
    "watchouts": ["Risks specific to this role"],
    "talkingPoints": ["Concrete differentiators vs fintech competitors"],
    "salaryPosition": "One sentence on where Acme total comp sits vs market"
  }
}

Be specific and realistic. Fintech not big tech. Salary in USD/year.`,
    { jsonMode: true }
  );

  const ai = JSON.parse(aiRaw);

  return {
    role,
    competitors: ai.competitors || [],
    salaryBenchmarks: ai.salaryBenchmarks || { low: 0, median: 0, high: 0, currency: "USD", source: "Market estimate" },
    jobPostings: ai.jobPostings || [],
    glassdoorData: ai.glassdoorData || [],
    positioningAdvice: ai.positioningAdvice || { strengths: [], watchouts: [], talkingPoints: [], salaryPosition: "" },
    sources: sourcesUsed,
  };
}
