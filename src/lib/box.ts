// Box client — developer token (runtime-refreshable)
let runtimeToken: string = process.env.BOX_DEVELOPER_TOKEN ?? "";

export function setBoxToken(token: string) {
  runtimeToken = token;
}

// ─── Core request helper ──────────────────────────────────────────────────────

async function boxRequest(path: string, options: RequestInit = {}) {
  const base = path.startsWith("https://") ? path : `https://api.box.com/2.0${path}`;
  const res = await fetch(base, {
    ...options,
    headers: {
      Authorization: `Bearer ${runtimeToken}`,
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Box ${path} → ${res.status}: ${await res.text()}`);
  return res;
}

// ─── Folder & file management ─────────────────────────────────────────────────

export async function getCommonDocuments() {
  const folderId = process.env.BOX_COMMON_FOLDER_ID!;
  const res = await boxRequest(`/folders/${folderId}/items?fields=id,name,size,created_at,modified_at&limit=100`);
  const data = await res.json();
  return (data.entries as { type: string }[]).filter((e) => e.type === "file");
}

export async function getCandidateDocuments(boxFolderId: string) {
  const res = await boxRequest(`/folders/${boxFolderId}/items?fields=id,name,size,created_at,modified_at&limit=100`);
  const data = await res.json();
  return (data.entries as { type: string }[]).filter((e) => e.type === "file");
}

export async function createCandidateFolder(candidateName: string, candidateId: string) {
  const parentId = process.env.BOX_CANDIDATES_ROOT_ID!;
  const res = await boxRequest("/folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `${candidateName} — ${candidateId}`,
      parent: { id: parentId },
    }),
  });
  const data = await res.json();
  if (!data.id) throw new Error(`Box folder creation failed: ${JSON.stringify(data)}`);
  return data.id as string;
}

export async function uploadCommonFile(fileName: string, content: Buffer) {
  return uploadFile(process.env.BOX_COMMON_FOLDER_ID!, fileName, content);
}

export async function uploadCandidateFile(candidateBoxFolderId: string, fileName: string, content: Buffer) {
  const folderInfo = await boxRequest(`/folders/${candidateBoxFolderId}`);
  const info = await folderInfo.json();
  if (info?.parent?.id !== process.env.BOX_CANDIDATES_ROOT_ID) {
    throw new Error(`Security: folder ${candidateBoxFolderId} is not a candidate folder`);
  }
  return uploadFile(candidateBoxFolderId, fileName, content);
}

export async function uploadFile(folderId: string, fileName: string, content: Buffer) {
  const form = new FormData();
  form.append("attributes", JSON.stringify({ name: fileName, parent: { id: folderId } }));
  form.append("file", new Blob([content as unknown as ArrayBuffer]), fileName);

  const res = await fetch("https://upload.box.com/api/2.0/files/content", {
    method: "POST",
    headers: { Authorization: `Bearer ${runtimeToken}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Box upload failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.entries[0];
}

export async function deleteFile(fileId: string) {
  await boxRequest(`/files/${fileId}`, { method: "DELETE" });
}

// ─── Box AI ───────────────────────────────────────────────────────────────────
// Uses Box's native AI to answer questions directly from stored files.
// No text extraction, no chunking — Box handles it natively.

export interface BoxAISource {
  fileId: string;
  fileName: string;
  content?: string; // snippet Box returns in citations
}

export interface BoxAIResult {
  answer: string;
  sources: BoxAISource[];
  completionReason: string;
}

export async function askBoxAI(
  question: string,
  fileIds: string[],
  fileNames: Record<string, string> // fileId → fileName map
): Promise<BoxAIResult> {
  if (fileIds.length === 0) {
    return {
      answer: "No documents are available to answer this question.",
      sources: [],
      completionReason: "no_documents",
    };
  }

  const res = await boxRequest("/ai/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "multiple_item_qa",       // answer across multiple files
      prompt: question,
      items: fileIds.map((id) => ({ type: "file", id })),
    }),
  });

  const data = await res.json();
  console.log(`[box-ai] answered "${question.slice(0, 60)}..." from ${fileIds.length} files`);

  const sources: BoxAISource[] = (data.citations ?? []).map(
    (c: { id: string; content?: string }) => ({
      fileId: c.id,
      fileName: fileNames[c.id] ?? c.id,
      content: c.content,
    })
  );

  return {
    answer: data.answer ?? "",
    sources,
    completionReason: data.completion_reason ?? "done",
  };
}

// ─── Box Webhooks ─────────────────────────────────────────────────────────────
// Register webhooks so Box calls us when files are added/deleted.
// Avoids polling Box on every request.

export interface BoxWebhook {
  id: string;
  target: { id: string; type: string };
  address: string;
  triggers: string[];
}

export async function listWebhooks(): Promise<BoxWebhook[]> {
  const res = await boxRequest("/webhooks");
  const data = await res.json();
  return data.entries ?? [];
}

export async function registerWebhook(
  folderId: string,
  callbackUrl: string,
  triggers = ["FILE.UPLOADED", "FILE.DELETED", "FILE.RENAMED", "FILE.RESTORED"]
): Promise<BoxWebhook> {
  const res = await boxRequest("/webhooks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target: { id: folderId, type: "folder" },
      address: callbackUrl,
      triggers,
    }),
  });
  return res.json();
}

export async function deleteWebhook(webhookId: string) {
  await boxRequest(`/webhooks/${webhookId}`, { method: "DELETE" });
}

// ─── Box Sign ─────────────────────────────────────────────────────────────────
// Send offer letters for e-signature directly from the candidate portal.
// Signed document is stored back in Box automatically.

export interface BoxSignRequest {
  id: string;
  status: string;
  signFiles: { files: { id: string; name: string }[] };
  signers: { email: string; status: string; signedAt?: string }[];
  prepareUrl?: string; // HR can review before sending
  signingLog?: { id: string };
}

export async function createSignRequest(params: {
  signerEmail: string;
  signerName: string;
  fileId: string;           // offer letter file in Box
  parentFolderId: string;   // where to store the signed copy
  emailSubject?: string;
  emailMessage?: string;
  redirectUrl?: string;
}): Promise<BoxSignRequest> {
  const res = await boxRequest("/sign_requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      signers: [
        {
          email: params.signerEmail,
          role: "signer",
          name: params.signerName,
        },
      ],
      source_files: [{ type: "file", id: params.fileId }],
      parent_folder: { type: "folder", id: params.parentFolderId },
      email_subject: params.emailSubject ?? "Please sign your offer letter",
      email_message: params.emailMessage ?? "Your offer letter is ready for your signature. Please review and sign at your earliest convenience.",
      ...(params.redirectUrl && { redirect_url: params.redirectUrl }),
    }),
  });

  const data = await res.json();
  console.log(`[box-sign] sign request created: ${data.id} for ${params.signerEmail}`);
  return data;
}

export async function getSignRequest(signRequestId: string): Promise<BoxSignRequest> {
  const res = await boxRequest(`/sign_requests/${signRequestId}`);
  return res.json();
}

export async function cancelSignRequest(signRequestId: string) {
  await boxRequest(`/sign_requests/${signRequestId}/cancel`, { method: "POST" });
}

export async function listSignRequests(): Promise<BoxSignRequest[]> {
  const res = await boxRequest("/sign_requests");
  const data = await res.json();
  return data.entries ?? [];
}
