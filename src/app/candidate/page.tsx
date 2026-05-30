"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

interface CandidateSession {
  id: string;
  name: string;
  email: string;
  role: string;
  boxFolderId: string | null;
}

interface Source {
  fileName: string;
  fileId: string;
  section?: string;
}

interface Message {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  sources?: Source[];
  classification?: "GREEN" | "YELLOW" | "RED";
}

function CandidatePortal() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [session, setSession] = useState<CandidateSession | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"ask" | "documents">("ask");
  const [documents, setDocuments] = useState<{ id: string; name: string; size: number }[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) {
      setAuthError("No access token provided. Please use your invite link.");
      return;
    }
    fetch(`/api/candidate/auth?token=${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setAuthError(data.error === "Token expired" ? "Your access link has expired. Please contact your recruiter." : "Invalid access link.");
        } else {
          setSession(data);
          fetchDocuments(data.boxFolderId);
          loadMessages(data.id);
        }
      });
  }, [token]);

  // Poll for new HR replies every 15 seconds
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => loadMessages(session.id), 15000);
    return () => clearInterval(interval);
  }, [session]);

  async function loadMessages(candidateId: string) {
    const res = await fetch(`/api/candidate/messages?candidateId=${candidateId}`);
    const data = await res.json();
    if (data.messages?.length > 0) {
      setMessages(data.messages);
      if (data.conversationId) setConversationId(data.conversationId);
    }
  }

  async function fetchDocuments(boxFolderId: string | null) {
    if (!boxFolderId) return;
    try {
      const res = await fetch(`/api/hr/documents`);
      const data = await res.json();
      setDocuments(Array.isArray(data) ? data : []);
    } catch {
      setDocuments([]);
    }
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !session) return;

    const userMsg: Message = { id: Date.now().toString(), role: "USER", content: input };
    setMessages((prev) => [...prev, userMsg]);
    const question = input;
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/candidate/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: session.id, question, conversationId }),
      });
      const data = await res.json();
      if (data.conversationId) setConversationId(data.conversationId);
      if (data.message) {
        setMessages((prev) => [...prev, { ...data.message, id: data.message.id || Date.now().toString() }]);
      }
    } catch {
      setMessages((prev) => [...prev, {
        id: Date.now().toString(),
        role: "ASSISTANT",
        content: "Sorry, something went wrong. Please try again.",
      }]);
    } finally {
      setLoading(false);
    }
  }

  if (!token || authError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Access Required</h2>
          <p className="text-sm text-gray-500">{authError || "Please use your invite link to access this portal."}</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-white">
      {/* Sidebar */}
      <div className="w-64 border-r border-gray-100 flex flex-col">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 bg-indigo-600 rounded-md flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <span className="font-bold text-gray-900">Acme</span>
          </div>
          <p className="text-xs text-gray-500">Offer Portal</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <button
            onClick={() => setActiveTab("ask")}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "ask" ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-50"}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3v-3z" />
            </svg>
            Ask
          </button>
          <button
            onClick={() => setActiveTab("documents")}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "documents" ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-50"}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Sources
          </button>
        </nav>

        <div className="p-4 border-t border-gray-100 space-y-3">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 leading-relaxed">Answers are based on documents provided by Acme. Not legal, tax, or financial advice. Please confirm details with Acme.</p>
          </div>
          <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Log out
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-8 py-4 border-b border-gray-100">
          <h1 className="text-xl font-semibold text-gray-900">
            {activeTab === "ask" ? "Ask about your offer" : "Your Documents"}
          </h1>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Welcome, {session.name.split(" ")[0]}</span>
            <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-xs font-medium text-indigo-700">
              {session.name[0]}
            </div>
          </div>
        </div>

        {activeTab === "ask" ? (
          <div className="flex-1 flex flex-col">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
              {messages.length === 0 && (
                <div className="text-center text-gray-400 mt-12">
                  <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3v-3z" />
                    </svg>
                  </div>
                  <p className="text-sm">Ask anything about your offer, benefits, or equity.</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {["How does vesting work?", "What's the PTO policy?", "What are my benefits?"].map((q) => (
                      <button
                        key={q}
                        onClick={() => setInput(q)}
                        className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-full text-gray-600 transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === "USER" ? "justify-end" : "justify-start gap-3"}`}>
                  {msg.role === "ASSISTANT" && (
                    <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center ${msg.content.startsWith("**Your recruiter replied") ? "bg-green-600" : "bg-indigo-600"}`}>
                      {msg.content.startsWith("**Your recruiter replied") ? (
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                      )}
                    </div>
                  )}
                  <div className={`max-w-xl ${msg.role === "USER" ? "bg-indigo-100 text-indigo-900 rounded-2xl rounded-tr-sm px-4 py-3" : ""}`}>
                    {msg.role === "ASSISTANT" && msg.content.startsWith("**Your recruiter replied") ? (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-green-700 ml-1 mb-1">Your Recruiter</div>
                        <div className="bg-green-50 border border-green-200 rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm">
                          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                            {msg.content.replace(/^\*\*Your recruiter replied to your question:\*\* "[^"]*"\n\n/, "")}
                          </p>
                        </div>
                      </div>
                    ) : msg.role === "ASSISTANT" ? (
                      <div className="space-y-3">
                        <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm">
                          <p className="text-sm text-gray-700 leading-relaxed">{msg.content}</p>
                        </div>
                        {msg.sources && (msg.sources as Source[]).length > 0 && (
                          <div>
                            <button className="text-xs text-gray-500 flex items-center gap-1 mb-2">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              Sources ({(msg.sources as Source[]).length})
                            </button>
                            <div className="flex gap-2 flex-wrap">
                              {(msg.sources as Source[]).map((s, i) => (
                                <div key={i} className="flex items-center gap-2 bg-white border border-gray-100 rounded-lg px-3 py-2 text-xs shadow-sm">
                                  <div className="w-5 h-5 bg-red-100 rounded flex items-center justify-center">
                                    <svg className="w-3 h-3 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                                    </svg>
                                  </div>
                                  <div>
                                    <div className="font-medium text-gray-800">{s.fileName}</div>
                                    {s.section && <div className="text-gray-400">{s.section}</div>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {msg.classification === "GREEN" && (
                          <div className="flex gap-2">
                            <button className="text-gray-400 hover:text-gray-600">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                              </svg>
                            </button>
                            <button className="text-gray-400 hover:text-gray-600">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13v-9m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm">{msg.content}</p>
                    )}
                  </div>

                </div>
              ))}

              {loading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-indigo-600 rounded-full flex-shrink-0 flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm">
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-8 py-6 border-t border-gray-100">
              <form onSubmit={handleSend} className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3">
                <button type="button" className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                </button>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask anything about your offer, benefits, or equity..."
                  className="flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center disabled:opacity-40 hover:bg-indigo-700 transition-colors flex-shrink-0"
                >
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <p className="text-sm text-gray-500 mb-4">These documents are available for your review.</p>
            {documents.length === 0 ? (
              <p className="text-gray-400 text-sm">No documents available yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-3 p-4 border border-gray-200 rounded-xl bg-white hover:border-indigo-200 transition-colors">
                    <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{doc.name}</div>
                      <div className="text-xs text-gray-400">{doc.size ? `${(doc.size / 1024).toFixed(0)} KB` : ""}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CandidatePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    }>
      <CandidatePortal />
    </Suspense>
  );
}
