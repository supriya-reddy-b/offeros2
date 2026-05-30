import { ApifyClient } from "apify-client";
import { askClaude } from "./bedrock";

const apify = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

export interface CandidateIntelligenceData {
  interests: string[];
  recentActivity: string[];
  suggestedTalkingPoints: string[];
  githubData: {
    active: boolean;
    username: string;
    recentCommits?: number;
    topLanguages?: string[];
    recentRepos?: string[];
    followers?: number;
    bio?: string;
  } | null;
  linkedinData: {
    headline?: string;
    summary?: string;
    currentCompany?: string;
    skills?: string[];
    recentUpdates?: string[];
  } | null;
}

// ─── GitHub via public REST API (no scraping needed) ──────────────────────────
async function fetchGitHub(candidateName: string, email: string): Promise<object | null> {
  const emailUser = email.split("@")[0];
  const nameParts = candidateName.toLowerCase().replace(/\s+/g, "");

  // Try email username first, then name-based guess
  const usernamesToTry = [emailUser, nameParts, candidateName.toLowerCase().replace(/\s+/g, "-")];

  for (const username of usernamesToTry) {
    try {
      const res = await fetch(`https://api.github.com/users/${username}`, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "OfferOS" },
      });
      if (!res.ok) continue;

      const user = await res.json();

      // Get recent repos
      const reposRes = await fetch(`https://api.github.com/users/${username}/repos?sort=updated&per_page=6`, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "OfferOS" },
      });
      const repos = reposRes.ok ? await reposRes.json() : [];

      // Get recent events (commits etc)
      const eventsRes = await fetch(`https://api.github.com/users/${username}/events/public?per_page=10`, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "OfferOS" },
      });
      const events = eventsRes.ok ? await eventsRes.json() : [];
      const pushEvents = events.filter((e: { type: string }) => e.type === "PushEvent");
      const recentCommits = pushEvents.reduce(
        (sum: number, e: { payload: { commits: unknown[] } }) => sum + (e.payload?.commits?.length ?? 0),
        0
      );

      // Top languages from repos
      const langs: Record<string, number> = {};
      for (const repo of repos.slice(0, 6)) {
        if (repo.language) langs[repo.language] = (langs[repo.language] || 0) + 1;
      }
      const topLanguages = Object.entries(langs)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([l]) => l);

      console.log(`[apify] GitHub found for ${username}: ${user.public_repos} repos, ${recentCommits} recent commits`);

      return {
        username,
        name: user.name,
        bio: user.bio,
        company: user.company,
        followers: user.followers,
        publicRepos: user.public_repos,
        recentCommits,
        topLanguages,
        recentRepos: repos.slice(0, 5).map((r: { name: string; description: string; stargazers_count: number }) => ({
          name: r.name,
          description: r.description,
          stars: r.stargazers_count,
        })),
      };
    } catch {
      continue;
    }
  }

  console.log(`[apify] GitHub not found for ${candidateName}`);
  return null;
}

// ─── LinkedIn via Apify ───────────────────────────────────────────────────────
async function fetchLinkedIn(candidateName: string): Promise<object | null> {
  const nameParts = candidateName.toLowerCase().split(" ");
  const slug = nameParts.join("-");

  try {
    const run = await apify.actor("2SyF0bVxmgGr8IVCZ").call({
      profileUrls: [`https://www.linkedin.com/in/${slug}/`],
      proxy: { useApifyProxy: true },
    }, { waitSecs: 60 });

    const { items } = await apify.dataset(run.defaultDatasetId).listItems();
    if (items.length > 0) {
      console.log(`[apify] LinkedIn found for ${candidateName}`);
      return items[0];
    }
  } catch (e) {
    console.warn(`[apify] LinkedIn scrape failed:`, e);
  }

  return null;
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function collectCandidateIntelligence(
  candidateName: string,
  candidateEmail: string
): Promise<CandidateIntelligenceData> {
  console.log(`[apify] collecting intelligence for ${candidateName} (${candidateEmail})`);

  const [githubRaw, linkedinRaw] = await Promise.allSettled([
    fetchGitHub(candidateName, candidateEmail),
    fetchLinkedIn(candidateName),
  ]);

  const github = githubRaw.status === "fulfilled" ? githubRaw.value : null;
  const linkedin = linkedinRaw.status === "fulfilled" ? linkedinRaw.value : null;

  console.log(`[apify] github: ${github ? "✓" : "✗"}, linkedin: ${linkedin ? "✓" : "✗"}`);

  // Only surface what was actually scraped — no AI fabrication
  const githubTyped = github as {
    username?: string;
    recentCommits?: number;
    topLanguages?: string[];
    recentRepos?: { name: string; description?: string; stars?: number }[];
    followers?: number;
    bio?: string;
    publicRepos?: number;
  } | null;

  const linkedinTyped = linkedin as {
    headline?: string;
    summary?: string;
    positions?: { companyName?: string }[];
    skills?: string[];
    activity?: string[];
  } | null;

  // Build recentActivity only from real scraped signals — empty if nothing found
  const recentActivity: string[] = [];
  if (githubTyped?.recentCommits && githubTyped.recentCommits > 0) {
    recentActivity.push(`Pushed ${githubTyped.recentCommits} commits in the last 30 days on GitHub`);
  }
  if (githubTyped?.recentRepos?.length) {
    const top = githubTyped.recentRepos[0];
    recentActivity.push(`Recently active on: ${top.name}${top.description ? ` — ${top.description}` : ""}`);
  }
  if (linkedinTyped?.activity?.length) {
    (linkedinTyped.activity as string[]).slice(0, 2).forEach(a => recentActivity.push(a));
  }

  return {
    interests: [],           // not fabricated — left for future real data source
    recentActivity,          // only real signals
    suggestedTalkingPoints: [], // removed — not shown in UI
    githubData: githubTyped
      ? {
          active: (githubTyped.recentCommits ?? 0) > 0,
          username: githubTyped.username ?? "",
          recentCommits: githubTyped.recentCommits,
          topLanguages: githubTyped.topLanguages,
          recentRepos: githubTyped.recentRepos?.map((r) => r.name),
          followers: githubTyped.followers,
          bio: githubTyped.bio ?? undefined,
        }
      : null,
    linkedinData: linkedinTyped
      ? {
          headline: linkedinTyped.headline,
          summary: linkedinTyped.summary,
          currentCompany: linkedinTyped.positions?.[0]?.companyName,
          skills: linkedinTyped.skills?.slice(0, 10),
          recentUpdates: Array.isArray(linkedinTyped.activity)
            ? (linkedinTyped.activity as string[]).slice(0, 3)
            : undefined,
        }
      : null,
  };
}
