"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate, formatFileSize } from "@/lib/utils";

interface BoxFile {
  id: string;
  name: string;
  size: number;
  created_at: string;
}

interface Candidate {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  escalations: { id: string }[];
  _count: { activities: number };
}

const STATUS_VARIANTS: Record<string, "success" | "warning" | "info" | "secondary" | "danger"> = {
  INVITED: "info",
  ACTIVE: "success",
  NEGOTIATING: "warning",
  ACCEPTED: "success",
  DECLINED: "danger",
};

export default function HRDashboard() {
  const [documents, setDocuments] = useState<BoxFile[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: "", email: "", role: "" });
  const [inviteLoading, setInviteLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchDocuments();
    fetchCandidates();
  }, []);

  async function fetchDocuments() {
    try {
      const res = await fetch("/api/hr/documents");
      const data = await res.json();
      setDocuments(Array.isArray(data) ? data : []);
    } catch {
      setDocuments([]);
    }
  }

  async function fetchCandidates() {
    const res = await fetch("/api/hr/candidates");
    const data = await res.json();
    setCandidates(data);
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteLoading(true);
    try {
      const res = await fetch("/api/hr/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inviteForm),
      });
      if (res.ok) {
        setShowInviteModal(false);
        setInviteForm({ name: "", email: "", role: "" });
        fetchCandidates();
      }
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadLoading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      await fetch("/api/hr/documents", { method: "POST", body: formData });
      fetchDocuments();
    } finally {
      setUploadLoading(false);
    }
  }

  async function handleDeleteDoc(fileId: string) {
    await fetch("/api/hr/documents", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId }),
    });
    fetchDocuments();
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Manage common documents and candidate offers.</p>
        </div>
        <Button onClick={() => setShowInviteModal(true)}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          Invite Candidate
        </Button>
      </div>

      {/* Common Documents */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-indigo-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>
              <div>
                <CardTitle>Common Documents</CardTitle>
                <p className="text-xs text-gray-500">These documents are available to all candidates.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} accept=".pdf,.doc,.docx" />
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} loading={uploadLoading}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Upload Common Docs
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No documents uploaded yet. Upload PDFs to get started.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left pb-3 font-medium text-gray-500">File Name</th>
                  <th className="text-left pb-3 font-medium text-gray-500">Uploaded</th>
                  <th className="text-left pb-3 font-medium text-gray-500">Size</th>
                  <th className="pb-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td className="py-3 flex items-center gap-2">
                      <div className="w-7 h-7 bg-red-100 rounded flex items-center justify-center">
                        <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                        </svg>
                      </div>
                      {doc.name}
                    </td>
                    <td className="py-3 text-gray-500">{formatDate(doc.created_at)}</td>
                    <td className="py-3 text-gray-500">{formatFileSize(doc.size)}</td>
                    <td className="py-3 text-right">
                      <button onClick={() => handleDeleteDoc(doc.id)} className="text-gray-400 hover:text-red-600 transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Candidates Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-purple-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <CardTitle>Candidates</CardTitle>
              <p className="text-xs text-gray-500">Manage candidate-specific offer documents and details.</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {candidates.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No candidates yet. Invite your first candidate above.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left pb-3 font-medium text-gray-500">Candidate</th>
                  <th className="text-left pb-3 font-medium text-gray-500">Status</th>
                  <th className="text-left pb-3 font-medium text-gray-500">Offer Details</th>
                  <th className="text-left pb-3 font-medium text-gray-500">Last Updated</th>
                  <th className="text-left pb-3 font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {candidates.map((c) => (
                  <tr key={c.id}>
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-xs font-medium text-indigo-700">
                          {c.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{c.name}</div>
                          <div className="text-xs text-gray-500">{c.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3">
                      <Badge variant={STATUS_VARIANTS[c.status] || "secondary"}>{c.status}</Badge>
                    </td>
                    <td className="py-3">
                      {c.escalations.length > 0 ? (
                        <Badge variant="warning">{c.escalations.length} open</Badge>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-3 text-gray-500">{formatDate(c.createdAt)}</td>
                    <td className="py-3">
                      <div className="flex gap-2">
                        <Link href={`/hr/candidates/${c.id}`}>
                          <Button size="sm" variant="outline">View</Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-semibold mb-6">Invite Candidate</h2>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <Input
                  required
                  placeholder="Alex Rivera"
                  value={inviteForm.name}
                  onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <Input
                  required
                  type="email"
                  placeholder="alex@example.com"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <Input
                  required
                  placeholder="Senior Software Engineer"
                  value={inviteForm.role}
                  onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="submit" loading={inviteLoading} className="flex-1">
                  Send Invite
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowInviteModal(false)} className="flex-1">
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
