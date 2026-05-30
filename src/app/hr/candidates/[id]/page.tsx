"use client";

import { useEffect, useState, use, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";

interface CandidateDetail {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  boxFolderId: string | null;
  createdAt: string;
  documents: BoxFile[];
  escalations: Escalation[];
  activities: Activity[];
  intelligence: Intelligence | null;
}

interface BoxFile {
  id: string;
  name: string;
  size: number;
  created_at: string;
}

interface Escalation {
  id: string;
  question: string;
  category: string;
  priority: string;
  status: string;
  aiRecommendation: string | null;
  hrResponse: string | null;
  createdAt: string;
}

interface Activity {
  id: string;
  type: string;
  description: string;
  createdAt: string;
}

interface Intelligence {
  interests: string[];
  recentActivity: string[];
  suggestedTalkingPoints: string[];
  githubData: { active: boolean; username?: string; recentCommits?: number; topLanguages?: string[]; recentRepos?: string[]; followers?: number; bio?: string } | null;
  linkedinData: { headline?: string; recentUpdates?: string[] } | null;
}

interface CompetitorIntel {
  role: string;
  competitors: { company: string; equivalentLevel?: string; salaryRange?: { min: number; max: number; currency: string }; rating?: number; reviewHighlights?: string[]; topPerks?: string[] }[];
  salaryBenchmarks: { low: number; median: number; high: number; currency: string; source: string };
  jobPostings: { company: string; title: string; location: string }[];
  glassdoorData: { company: string; rating: number; reviewSnippets: string[] }[];
  positioningAdvice: { strengths: string[]; watchouts: string[]; talkingPoints: string[]; salaryPosition: string };
  sources: string[];
  updatedAt: string;
}

const PRIORITY_VARIANTS: Record<string, "danger" | "warning" | "secondary"> = {
  HIGH: "danger",
  MEDIUM: "warning",
  LOW: "secondary",
};

export default function CandidateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [candidate, setCandidate] = useState<CandidateDetail | null>(null);
  const [brief, setBrief] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");
  const [sendingResponse, setSendingResponse] = useState(false);
  const [intelLoading, setIntelLoading] = useState(false);
  const [competitorIntel, setCompetitorIntel] = useState<CompetitorIntel | null>(null);
  const [competitorLoading, setCompetitorLoading] = useState(false);
  const [health, setHealth] = useState<{
    score: number; label: string; color: string;
    factors: { label: string; score: number; weight: number; detail: string; direction: string }[];
    recommendation: string; aiReasoning: string; computedAt: string;
  } | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [candidateDocs, setCandidateDocs] = useState<{ id: string; boxFileId: string; fileName: string; docType: string; uploadedAt: string }[]>([]);
  const [docUploadLoading, setDocUploadLoading] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState("OFFER_LETTER");
  const candidateFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/hr/candidates/${id}`)
      .then((r) => r.json())
      .then(setCandidate);
    fetch(`/api/competitor/${id}`)
      .then((r) => r.json())
      .then((d) => { if (d && d.role) setCompetitorIntel(d); });
    fetchCandidateDocs();
    fetchHealth();
  }, [id]);

  async function fetchHealth() {
    setHealthLoading(true);
    try {
      const res = await fetch(`/api/hr/candidates/${id}/health`);
      if (res.ok) setHealth(await res.json());
    } finally {
      setHealthLoading(false);
    }
  }

  async function fetchCandidateDocs() {
    const res = await fetch(`/api/hr/candidates/${id}/documents`);
    const data = await res.json();
    setCandidateDocs(data.dbDocs ?? []);
  }

  async function handleCandidateDocUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setDocUploadLoading(true);
    try {
      const formData = new FormData();
      files.forEach(f => formData.append("file", f));
      formData.append("docType", selectedDocType);
      await fetch(`/api/hr/candidates/${id}/documents`, { method: "POST", body: formData });
      fetchCandidateDocs();
      const res = await fetch(`/api/hr/candidates/${id}`);
      setCandidate(await res.json());
    } finally {
      setDocUploadLoading(false);
      if (candidateFileRef.current) candidateFileRef.current.value = "";
    }
  }

  async function handleDeleteCandidateDoc(boxFileId: string) {
    await fetch(`/api/hr/candidates/${id}/documents`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boxFileId }),
    });
    fetchCandidateDocs();
  }

  async function runCompetitorIntel() {
    setCompetitorLoading(true);
    try {
      const res = await fetch(`/api/competitor/${id}`, { method: "POST" });
      const data = await res.json();
      if (data.role) setCompetitorIntel(data);
    } finally {
      setCompetitorLoading(false);
    }
  }

  async function generateBrief() {
    setBriefLoading(true);
    try {
      const res = await fetch(`/api/brief/${id}`, { method: "POST" });
      const data = await res.json();
      setBrief(data.brief);
    } finally {
      setBriefLoading(false);
    }
  }

  async function refreshIntelligence() {
    setIntelLoading(true);
    try {
      await fetch(`/api/intelligence/${id}`, { method: "POST" });
      const res = await fetch(`/api/hr/candidates/${id}`);
      setCandidate(await res.json());
    } finally {
      setIntelLoading(false);
    }
  }

  async function respondToEscalation(escalationId: string) {
    if (sendingResponse) return;
    setSendingResponse(true);
    try {
      await fetch(`/api/hr/escalations/${escalationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hrResponse: responseText, status: "RESOLVED" }),
      });
      setRespondingId(null);
      setResponseText("");
      const res = await fetch(`/api/hr/candidates/${id}`);
      setCandidate(await res.json());
    } finally {
      setSendingResponse(false);
    }
  }

  if (!candidate) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const openEscalations = candidate.escalations.filter((e) => e.status !== "RESOLVED");
  const intel = candidate.intelligence;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/hr" className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex items-center gap-3 flex-1">
          <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center font-medium text-indigo-700">
            {candidate.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Candidate Profile — {candidate.name}</h1>
            <p className="text-sm text-gray-500">{candidate.role} · {candidate.email}</p>
          </div>
        </div>
        <Badge variant={candidate.status === "ACTIVE" ? "success" : "info"}>{candidate.status}</Badge>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left column */}
        <div className="col-span-2 space-y-6">
          {/* Candidate-Specific Documents */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Candidate Documents</CardTitle>
                  <p className="text-xs text-gray-400 mt-0.5">Private to {candidate.name} only — offer letter, equity grant, team brief, etc.</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedDocType}
                    onChange={(e) => setSelectedDocType(e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 bg-white"
                  >
                    <option value="OFFER_LETTER">Offer Letter</option>
                    <option value="EQUITY_GRANT">Equity Grant</option>
                    <option value="COMPENSATION_BREAKDOWN">Compensation Breakdown</option>
                    <option value="TEAM_OVERVIEW">Team Overview</option>
                    <option value="ROLE_DETAILS">Role Details</option>
                    <option value="RELOCATION">Relocation Package</option>
                    <option value="OTHER">Other</option>
                  </select>
                  <input ref={candidateFileRef} type="file" className="hidden" multiple accept=".pdf,.doc,.docx" onChange={handleCandidateDocUpload} />
                  <Button size="sm" onClick={() => candidateFileRef.current?.click()} loading={docUploadLoading}>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Upload
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {candidateDocs.length === 0 ? (
                <p className="text-sm text-gray-400">No candidate-specific documents yet. Upload an offer letter, equity grant, or team brief.</p>
              ) : (
                <div className="space-y-2">
                  {candidateDocs.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                      <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{doc.fileName}</div>
                        <div className="text-xs text-gray-400">{doc.docType.replace(/_/g, " ")} · {formatDate(doc.uploadedAt)}</div>
                      </div>
                      <button onClick={() => handleDeleteCandidateDoc(doc.boxFileId)} className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Candidate Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {candidate.activities.length === 0 ? (
                <p className="text-sm text-gray-400">No activity recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {candidate.activities.slice(0, 10).map((a) => (
                    <div key={a.id} className="flex items-start gap-3 text-sm">
                      <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${a.type === "QUESTION" ? "bg-indigo-500" : a.type === "LOGIN" ? "bg-green-500" : "bg-gray-300"}`} />
                      <div className="flex-1 min-w-0">
                        <span className="text-gray-700 truncate block">{a.description}</span>
                      </div>
                      <span className="text-gray-400 text-xs flex-shrink-0">{formatDate(a.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Open Escalations */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Open Escalations</CardTitle>
                {openEscalations.length > 0 && (
                  <Badge variant="danger">{openEscalations.length} open</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {openEscalations.length === 0 ? (
                <p className="text-sm text-gray-400">No open escalations.</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {openEscalations.map((esc) => {
                    const isConcernSignal = esc.category.startsWith("⚑");
                    const cleanCategory = esc.category.replace("⚑ Concern signal: ", "");
                    // Truncate AI rec to one short sentence
                    const shortRec = esc.aiRecommendation
                      ? esc.aiRecommendation.split(".")[0] + "."
                      : null;
                    return (
                      <div key={esc.id} className="py-3 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                isConcernSignal
                                  ? "bg-amber-100 text-amber-700"
                                  : esc.priority === "HIGH"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-gray-100 text-gray-600"
                              }`}>
                                {isConcernSignal ? "Signal" : esc.priority}
                              </span>
                              <span className="text-xs text-gray-400 truncate">{cleanCategory}</span>
                            </div>
                            <p className="text-sm text-gray-800">{esc.question}</p>
                            {shortRec && (
                              <p className="text-xs text-gray-400 mt-1">{shortRec}</p>
                            )}
                          </div>
                          <Button size="sm" variant="outline" onClick={() => setRespondingId(esc.id)} className="flex-shrink-0">
                            Respond
                          </Button>
                        </div>
                        {respondingId === esc.id && (
                          <div className="space-y-2 pt-1">
                            <Textarea rows={3} placeholder="Write your response..." value={responseText} onChange={(e) => setResponseText(e.target.value)} />
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => respondToEscalation(esc.id)} loading={sendingResponse}>Send</Button>
                              <Button size="sm" variant="ghost" onClick={() => setRespondingId(null)}>Cancel</Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Candidate Brief */}
          <Card>
            <CardHeader>
              <CardTitle>Candidate Brief</CardTitle>
            </CardHeader>
            <CardContent>
              {brief ? (
                <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 p-4 rounded-xl">
                  {brief}
                </div>
              ) : (
                <div className="text-center py-4 space-y-3">
                  <p className="text-sm text-gray-500">Generate an AI summary of this candidate's concerns, engagement, and recommended actions.</p>
                  <Button onClick={generateBrief} loading={briefLoading}>
                    Generate Candidate Brief
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column — HR Intelligence */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>HR Intelligence</CardTitle>
                <button onClick={refreshIntelligence} disabled={intelLoading} className="text-xs text-indigo-600 hover:underline disabled:opacity-50">
                  {intelLoading ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Concern Signals — derived from escalations */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Concern Signals</p>
                <div className="space-y-2">
                  {openEscalations.length > 0 ? (
                    openEscalations.slice(0, 3).map((e) => (
                      <div key={e.id} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700">{e.category}</span>
                        <Badge variant={PRIORITY_VARIANTS[e.priority] || "secondary"}>{e.priority}</Badge>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-gray-400">No active concerns.</p>
                  )}
                </div>
              </div>

              {/* Candidate Public Signals — only real scraped data */}
              {intel ? (
                <>
                  {/* GitHub */}
                  {(intel.githubData as { username?: string } | null)?.username ? (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">GitHub</p>
                      <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                        <div className="flex items-center gap-2 font-medium text-gray-800">
                          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12"/></svg>
                          <a href={`https://github.com/${(intel.githubData as { username?: string }).username}`} target="_blank" rel="noopener noreferrer" className="hover:underline text-indigo-700">
                            {(intel.githubData as { username?: string }).username}
                          </a>
                          {(intel.githubData as { followers?: number }).followers !== undefined && (
                            <span className="text-xs text-gray-400 font-normal">{(intel.githubData as { followers?: number }).followers} followers</span>
                          )}
                        </div>
                        {(intel.githubData as { recentCommits?: number }).recentCommits !== undefined && (
                          <div className="text-xs text-gray-600">
                            {(intel.githubData as { recentCommits?: number }).recentCommits === 0
                              ? "No recent commits in last 30 days"
                              : `${(intel.githubData as { recentCommits?: number }).recentCommits} commits in last 30 days`}
                          </div>
                        )}
                        {((intel.githubData as { topLanguages?: string[] }).topLanguages ?? []).length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {((intel.githubData as { topLanguages?: string[] }).topLanguages ?? []).map((lang) => (
                              <span key={lang} className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full">{lang}</span>
                            ))}
                          </div>
                        )}
                        {((intel.githubData as { recentRepos?: string[] }).recentRepos ?? []).length > 0 && (
                          <div className="text-xs text-gray-500">
                            Recent: {((intel.githubData as { recentRepos?: string[] }).recentRepos ?? []).slice(0, 3).join(", ")}
                          </div>
                        )}
                        {(intel.githubData as { bio?: string }).bio && (
                          <div className="text-xs text-gray-400 italic">"{(intel.githubData as { bio?: string }).bio}"</div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">GitHub</p>
                      <p className="text-xs text-gray-400">No public profile found.</p>
                    </div>
                  )}

                  {/* LinkedIn — only if scraped */}
                  {(intel.linkedinData as { headline?: string } | null)?.headline && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">LinkedIn</p>
                      <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                        <div className="text-sm font-medium text-gray-800">{(intel.linkedinData as { headline?: string }).headline}</div>
                        {(intel.linkedinData as { currentCompany?: string }).currentCompany && (
                          <div className="text-xs text-gray-500">{(intel.linkedinData as { currentCompany?: string }).currentCompany}</div>
                        )}
                        {((intel.linkedinData as { skills?: string[] }).skills ?? []).length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {((intel.linkedinData as { skills?: string[] }).skills ?? []).slice(0, 6).map((s) => (
                              <span key={s} className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">{s}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Recent Activity — only real signals, never fabricated */}
                  {(intel.recentActivity as string[])?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recent Public Activity</p>
                      <div className="space-y-2">
                        {(intel.recentActivity as string[]).map((a, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-gray-700">
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-1 flex-shrink-0" />
                            {a}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Nothing found at all */}
                  {!(intel.githubData as { username?: string } | null)?.username &&
                   !(intel.linkedinData as { headline?: string } | null)?.headline &&
                   (intel.recentActivity as string[])?.length === 0 && (
                    <p className="text-xs text-gray-400">No public signals found for this candidate.</p>
                  )}
                </>
              ) : (
                <div className="text-center py-4 space-y-2">
                  <p className="text-xs text-gray-400">No public signals collected yet.</p>
                  <Button size="sm" variant="outline" onClick={refreshIntelligence} loading={intelLoading}>
                    Collect Signals
                  </Button>
                </div>
              )}

              {/* Offer Health — AI scored */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Offer Health</p>
                  <button onClick={fetchHealth} disabled={healthLoading} className="text-xs text-indigo-600 hover:underline disabled:opacity-50">
                    {healthLoading ? "Scoring..." : "Refresh"}
                  </button>
                </div>

                {healthLoading && !health && (
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <div className="w-3 h-3 border border-indigo-400 border-t-transparent rounded-full animate-spin" />
                    AI is assessing...
                  </div>
                )}

                {health && (
                  <div className="space-y-4">
                    {/* Gauge + label */}
                    <div className="flex items-center gap-4">
                      <div className="relative w-16 h-16 flex-shrink-0">
                        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
                          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                          <circle
                            cx="18" cy="18" r="15.9" fill="none"
                            stroke={health.color === "green" ? "#22c55e" : health.color === "red" ? "#ef4444" : "#f59e0b"}
                            strokeWidth="3"
                            strokeDasharray={`${health.score} 100`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-gray-800">
                          {health.score}
                        </div>
                      </div>
                      <div>
                        <div className={`font-semibold text-sm ${health.color === "green" ? "text-green-600" : health.color === "red" ? "text-red-600" : "text-amber-600"}`}>
                          {health.label}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{health.aiReasoning}</p>
                      </div>
                    </div>

                    {/* Factor breakdown */}
                    <div className="space-y-2">
                      {health.factors.map((f, i) => (
                        <div key={i}>
                          <div className="flex items-center justify-between text-xs mb-0.5">
                            <span className="flex items-center gap-1 text-gray-600">
                              <span className={f.direction === "good" ? "text-green-500" : f.direction === "bad" ? "text-red-500" : "text-gray-400"}>
                                {f.direction === "good" ? "↑" : f.direction === "bad" ? "↓" : "→"}
                              </span>
                              {f.label}
                            </span>
                            <span className="font-medium text-gray-700">{f.score}/100</span>
                          </div>
                          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${f.direction === "good" ? "bg-green-400" : f.direction === "bad" ? "bg-red-400" : "bg-amber-400"}`}
                              style={{ width: `${f.score}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">{f.detail}</p>
                        </div>
                      ))}
                    </div>

                    {/* Recommendation */}
                    <div className="bg-indigo-50 rounded-lg p-3">
                      <p className="text-xs font-medium text-indigo-700 mb-0.5">Recommended Action</p>
                      <p className="text-xs text-indigo-600">{health.recommendation}</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Competitor Intelligence */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-orange-100 rounded-lg flex items-center justify-center">
                    <svg className="w-4 h-4 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <CardTitle>Competitor Intelligence</CardTitle>
                </div>
                {competitorIntel && (
                  <button onClick={runCompetitorIntel} disabled={competitorLoading} className="text-xs text-orange-600 hover:underline disabled:opacity-50">
                    {competitorLoading ? "Refreshing..." : "Refresh"}
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!competitorIntel ? (
                <div className="text-center py-6 space-y-3">
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Run competitor analysis to see salary benchmarks, Glassdoor ratings, active job postings, and positioning advice — powered by Apify.
                  </p>
                  <div className="flex flex-wrap justify-center gap-1.5 text-xs text-gray-400">
                    {["Glassdoor", "LinkedIn Jobs", "Google Search", "Levels.fyi"].map(s => (
                      <span key={s} className="bg-gray-100 px-2 py-0.5 rounded-full">{s}</span>
                    ))}
                  </div>
                  <Button size="sm" onClick={runCompetitorIntel} loading={competitorLoading} className="bg-orange-600 hover:bg-orange-700">
                    Run Competitor Analysis
                  </Button>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Sources */}
                  <div className="flex flex-wrap gap-1.5">
                    {competitorIntel.sources.map((s) => (
                      <span key={s} className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full font-medium">{s}</span>
                    ))}
                  </div>

                  {/* Salary Benchmarks */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Market Salary Range — {competitorIntel.role}</p>
                    <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl p-4">
                      <div className="flex justify-between text-xs text-gray-500 mb-2">
                        <span>Low</span><span>Median</span><span>High</span>
                      </div>
                      <div className="flex justify-between font-bold text-sm text-gray-800">
                        <span>${competitorIntel.salaryBenchmarks.low.toLocaleString()}</span>
                        <span className="text-orange-700 text-base">${competitorIntel.salaryBenchmarks.median.toLocaleString()}</span>
                        <span>${competitorIntel.salaryBenchmarks.high.toLocaleString()}</span>
                      </div>
                      <div className="relative mt-2 h-2 bg-gray-200 rounded-full">
                        <div className="absolute inset-y-0 left-1/4 right-1/4 bg-orange-400 rounded-full" />
                        <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-center">
                          <div className="w-3 h-3 bg-orange-600 rounded-full border-2 border-white shadow" style={{ marginLeft: "50%" }} />
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 mt-2">{competitorIntel.salaryBenchmarks.source}</p>
                    </div>
                    {competitorIntel.positioningAdvice.salaryPosition && (
                      <p className="text-xs text-gray-600 mt-2 italic">{competitorIntel.positioningAdvice.salaryPosition}</p>
                    )}
                  </div>

                  {/* Competitors table */}
                  {competitorIntel.competitors.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Equivalent Roles at Competitors</p>
                      <div className="space-y-0">
                        {competitorIntel.competitors.slice(0, 6).map((c) => (
                          <div key={c.company} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-800">{c.company}</span>
                              {c.equivalentLevel && (
                                <span className="bg-gray-100 text-gray-600 text-xs px-1.5 py-0.5 rounded font-mono">{c.equivalentLevel}</span>
                              )}
                              {c.rating && <span className="text-xs text-amber-500">★ {c.rating.toFixed(1)}</span>}
                            </div>
                            {c.salaryRange && (
                              <span className="text-xs text-gray-500">
                                ${c.salaryRange.min.toLocaleString()}–${c.salaryRange.max.toLocaleString()}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Positioning Advice */}
                  {competitorIntel.positioningAdvice.strengths.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Acme Strengths to Highlight</p>
                      <div className="space-y-1.5">
                        {competitorIntel.positioningAdvice.strengths.map((s, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-gray-700">
                            <span className="text-green-500 mt-0.5">✓</span> {s}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {competitorIntel.positioningAdvice.watchouts.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Watch Outs</p>
                      <div className="space-y-1.5">
                        {competitorIntel.positioningAdvice.watchouts.map((w, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-gray-700">
                            <span className="text-amber-500 mt-0.5">⚠</span> {w}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {competitorIntel.positioningAdvice.talkingPoints.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recruiter Talking Points</p>
                      <div className="space-y-1.5">
                        {competitorIntel.positioningAdvice.talkingPoints.map((t, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-gray-700">
                            <svg className="w-3 h-3 text-indigo-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            {t}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Active Job Postings */}
                  {competitorIntel.jobPostings.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Competitor Job Postings</p>
                      <div className="space-y-1.5">
                        {competitorIntel.jobPostings.slice(0, 4).map((j, i) => (
                          <div key={i} className="text-xs text-gray-600 flex justify-between">
                            <span><span className="font-medium text-gray-800">{j.company}</span> · {j.title}</span>
                            <span className="text-gray-400">{j.location}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
