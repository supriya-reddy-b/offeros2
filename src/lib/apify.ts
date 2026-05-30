import { ApifyClient } from "apify-client";
import OpenAI from "openai";

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

export interface CandidateIntelligenceData {
  interests: string[];
  recentActivity: string[];
  suggestedTalkingPoints: string[];
  githubData: {
    active: boolean;
    recentCommits?: number;
    topLanguages?: string[];
    recentRepos?: string[];
  } | null;
  linkedinData: {
    recentUpdates?: string[];
    headline?: string;
  } | null;
}

async function scrapeGitHub(username: string) {
  try {
    const run = await client.actor("apify/github-scraper").call({
      startUrls: [{ url: `https://github.com/${username}` }],
      maxDepth: 1,
    });
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    return items[0] || null;
  } catch {
    return null;
  }
}

async function scrapeLinkedIn(linkedinUrl: string) {
  try {
    const run = await client.actor("apify/linkedin-profile-scraper").call({
      profileUrls: [linkedinUrl],
    });
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    return items[0] || null;
  } catch {
    return null;
  }
}

export async function collectCandidateIntelligence(
  candidateName: string,
  candidateEmail: string
): Promise<CandidateIntelligenceData> {
  const emailUser = candidateEmail.split("@")[0];
  const nameParts = candidateName.toLowerCase().split(" ");

  const [githubRaw, linkedinRaw] = await Promise.allSettled([
    scrapeGitHub(emailUser),
    scrapeLinkedIn(`https://www.linkedin.com/in/${nameParts.join("-")}`),
  ]);

  const github = githubRaw.status === "fulfilled" ? githubRaw.value : null;
  const linkedin = linkedinRaw.status === "fulfilled" ? linkedinRaw.value : null;

  const signals = JSON.stringify({ github, linkedin, candidateName });

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `Analyze candidate public signals and extract:
1. interests (array of 3-6 topics/areas they seem interested in)
2. recentActivity (array of 2-4 recent notable public activities)
3. suggestedTalkingPoints (array of 3-5 specific talking points for a recruiter call)

If data is sparse, make reasonable inferences from what's available. Always return valid arrays.

Respond with JSON: { "interests": [], "recentActivity": [], "suggestedTalkingPoints": [] }`,
      },
      { role: "user", content: signals },
    ],
    response_format: { type: "json_object" },
  });

  const ai = JSON.parse(response.choices[0].message.content!);

  return {
    interests: ai.interests || [],
    recentActivity: ai.recentActivity || [],
    suggestedTalkingPoints: ai.suggestedTalkingPoints || [],
    githubData: github
      ? {
          active: true,
          recentCommits: typeof github.recentCommitsCount === "number" ? github.recentCommitsCount : undefined,
          topLanguages: Array.isArray(github.topLanguages) ? (github.topLanguages as string[]) : undefined,
          recentRepos: Array.isArray(github.recentRepos)
            ? (github.recentRepos as { name: string }[]).map((r) => r.name)
            : undefined,
        }
      : null,
    linkedinData: linkedin
      ? {
          headline: typeof linkedin.headline === "string" ? linkedin.headline : undefined,
          recentUpdates: Array.isArray(linkedin.recentActivity) ? (linkedin.recentActivity as string[]) : undefined,
        }
      : null,
  };
}
