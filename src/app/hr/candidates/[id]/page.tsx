"use client";

import { useEffect, useState, use } from "react";
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
  githubData: { active: boolean; recentCommits?: number } | null;
  linkedinData: { headline?: string; recentUpdates?: string[] } | null;
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
  const [intelLoading, setIntelLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/hr/candidates/${id}`)
      .then((r) => r.json())
      .then(setCandidate);
  }, [id]);

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
    await fetch(`/api/hr/escalations/${escalationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hrResponse: responseText, status: "RESOLVED" }),
    });
    setRespondingId(null);
    setResponseText("");
    const res = await fetch(`/api/hr/candidates/${id}`);
    setCandidate(await res.json());
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
          {/* Documents */}
          <Card>
            <CardHeader>
              <CardTitle>Uploaded Documents</CardTitle>
            </CardHeader>
            <CardContent>
              {candidate.documents.length === 0 ? (
                <p className="text-sm text-gray-400">No documents uploaded yet.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {candidate.documents.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-3 p-3 border border-gray-100 rounded-lg">
                      <div className="w-8 h-8 bg-blue-100 rounded flex items-center justify-center">
                        <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{doc.name}</div>
                        <div className="text-xs text-gray-400">{formatDate(doc.created_at)}</div>
                      </div>
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
                <div className="space-y-4">
                  {openEscalations.map((esc) => (
                    <div key={esc.id} className="border border-gray-100 rounded-xl p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={PRIORITY_VARIANTS[esc.priority] || "secondary"}>{esc.priority}</Badge>
                            <span className="text-xs text-gray-500">{esc.category}</span>
                          </div>
                          <p className="text-sm text-gray-800 font-medium">{esc.question}</p>
                          {esc.aiRecommendation && (
                            <p className="text-xs text-gray-500 mt-2 bg-indigo-50 p-2 rounded-lg">
                              <span className="font-medium text-indigo-700">AI Rec: </span>{esc.aiRecommendation}
                            </p>
                          )}
                        </div>
                      </div>
                      {respondingId === esc.id ? (
                        <div className="space-y-2">
                          <Textarea
                            rows={3}
                            placeholder="Write your response..."
                            value={responseText}
                            onChange={(e) => setResponseText(e.target.value)}
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => respondToEscalation(esc.id)}>Send Response</Button>
                            <Button size="sm" variant="outline" onClick={() => setRespondingId(null)}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setRespondingId(esc.id)}>Respond</Button>
                      )}
                    </div>
                  ))}
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

              {/* Candidate Signals from Apify */}
              {intel && (
                <>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Candidate Signals</p>
                    <div className="space-y-2">
                      {intel.githubData?.active && (
                        <div className="flex items-start gap-2 text-sm">
                          <div className="w-2 h-2 bg-green-500 rounded-full mt-1.5 flex-shrink-0" />
                          <div>
                            <div className="font-medium text-gray-800">GitHub active</div>
                            {intel.githubData.recentCommits && (
                              <div className="text-xs text-gray-500">Pushed {intel.githubData.recentCommits} commits in the last 30 days</div>
                            )}
                          </div>
                        </div>
                      )}
                      {(intel.recentActivity as string[])?.map((activity, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 flex-shrink-0" />
                          <span className="text-gray-700">{activity}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Suggested Closing Actions</p>
                    <div className="space-y-2">
                      {(intel.suggestedTalkingPoints as string[])?.slice(0, 3).map((point, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm text-gray-700">
                          <svg className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                          {point}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {!intel && (
                <div className="text-center py-4">
                  <p className="text-xs text-gray-400 mb-3">Intelligence data not yet collected.</p>
                  <Button size="sm" variant="outline" onClick={refreshIntelligence} loading={intelLoading}>
                    Collect Intelligence
                  </Button>
                </div>
              )}

              {/* Offer Health */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Offer Health</p>
                <div className="flex items-center gap-4">
                  <div className="relative w-16 h-16">
                    <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
                      <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                      <circle
                        cx="18" cy="18" r="15.9" fill="none"
                        stroke={openEscalations.length === 0 ? "#22c55e" : openEscalations.length <= 2 ? "#f59e0b" : "#ef4444"}
                        strokeWidth="3"
                        strokeDasharray={`${openEscalations.length === 0 ? 90 : openEscalations.length <= 2 ? 72 : 50} 100`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-gray-800">
                      {openEscalations.length === 0 ? "90%" : openEscalations.length <= 2 ? "72%" : "50%"}
                    </div>
                  </div>
                  <div>
                    <div className={`font-medium text-sm ${openEscalations.length === 0 ? "text-green-600" : openEscalations.length <= 2 ? "text-amber-600" : "text-red-600"}`}>
                      {openEscalations.length === 0 ? "Excellent" : openEscalations.length <= 2 ? "Good" : "Needs Attention"}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {openEscalations.length === 0 ? "No open concerns." : `${openEscalations.length} open escalation${openEscalations.length > 1 ? "s" : ""}.`}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
