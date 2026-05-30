import { ApifyClient } from "apify-client";
import OpenAI from "openai";

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
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a fintech talent market expert. Given a job role at Acme (a Series C fintech startup in payments/financial infrastructure), identify the 6 most relevant competitor companies AND the equivalent level at each company that would realistically be competing for this exact candidate.

Rules:
- Only fintech companies (payments, banking, crypto, expense mgmt, lending, compliance tech, etc.)
- Match FUNCTION (engineering vs product vs compliance vs sales etc.), SENIORITY (IC vs manager vs director vs VP), and infer the equivalent level at each competitor
- Level mapping examples:
  - "Senior Engineer" → Stripe L4, Coinbase E4, PayPal P5, Plaid Senior
  - "Staff Engineer" → Stripe L5, Coinbase E5, PayPal P6, Plaid Staff
  - "Principal Engineer" → Stripe L6, Coinbase E6, PayPal P7
  - "Senior PM" → Stripe PM3, Coinbase PM4, Brex Senior PM
  - "Director of Engineering" → Stripe L7, Coinbase Director, PayPal Director
  - "VP Engineering" → Stripe L8/VP, Coinbase VP, PayPal VP
- For senior/director+ roles: include larger fintechs (Stripe, PayPal, Coinbase)
- For IC/mid-level: weight toward same-stage fintechs (Brex, Ramp, Plaid, Chime, Marqeta)
- For specialized roles (compliance, fraud, risk): include domain-specific fintechs
- For crypto/web3: include Coinbase, Robinhood, Kraken, Gemini
- Never include non-fintech companies

Return JSON only: {
  "competitors": ["Company1", "Company2", "Company3", "Company4", "Company5", "Company6"],
  "levels": { "Company1": "L5", "Company2": "E5", "Company3": "Senior" },
  "reasoning": "one line why these companies and levels"
}`,
      },
      { role: "user", content: `Role: ${role}` },
    ],
    response_format: { type: "json_object" },
  });

  const result = JSON.parse(response.choices[0].message.content!);
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
    "GPT-4o synthesis",
  ].filter(Boolean) as string[];

  console.log(`[competitor] sources: ${sourcesUsed.join(", ")}`);

  // Synthesize everything with OpenAI
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are a competitive compensation intelligence analyst for Acme — a Series C fintech startup competing for talent against Stripe, Plaid, Brex, Ramp, Chime, Coinbase, and similar companies.

Your job: give the Acme recruiter intelligence they CANNOT get from the interview — only from the public market.

Context about Acme:
- Series C fintech, ~$500M raised, 300–600 employees
- Offers competitive base + meaningful equity (Series C = real upside potential)
- Smaller than Stripe/PayPal but more equity leverage and faster career growth
- Strong engineering culture, remote-friendly

Use scraped data where available. Fill gaps with your knowledge of fintech compensation in 2024-2025.

Return JSON:
{
  "competitors": [
    {
      "company": "Stripe",
      "equivalentLevel": "L5",
      "salaryRange": { "min": 180000, "max": 280000, "currency": "USD" },
      "rating": 4.4,
      "reviewHighlights": ["top-tier eng culture", "high bar, slow promotions"],
      "topPerks": ["RSU refresh", "remote-friendly", "strong brand"]
    }
  ],
  "salaryBenchmarks": {
    "low": 150000,
    "median": 200000,
    "high": 300000,
    "currency": "USD",
    "source": "Glassdoor / levels.fyi fintech 2025 estimates"
  },
  "jobPostings": [
    { "company": "Stripe", "title": "${role}", "location": "Remote / SF" }
  ],
  "glassdoorData": [
    { "company": "Stripe", "rating": 4.4, "reviewSnippets": ["Great engineers", "Intense pace"] }
  ],
  "positioningAdvice": {
    "strengths": ["Acme-specific advantages a recruiter can talk to — equity upside at Series C, ownership of whole systems, faster promo cycles than Stripe/Coinbase"],
    "watchouts": ["Risks specific to THIS role — e.g. if Stripe is hiring for same role right now, candidate likely has that option too"],
    "talkingPoints": ["Concrete things to say on the recruiter call that differentiate Acme from the specific fintech competitors"],
    "salaryPosition": "One sentence: where does Acme's total comp sit vs these fintech competitors for this role"
  }
}

Be specific and realistic. Think fintech, not big tech. Salary in USD/year.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          role,
          competitors,
          equivalentLevels: levels,
          googleSearchResults: google.slice(0, 8),
          linkedinData: linkedin.slice(0, 5),
          githubSignals: github,
        }),
      },
    ],
    response_format: { type: "json_object" },
  });

  const ai = JSON.parse(response.choices[0].message.content!);

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
