// Box client using Developer Token (runtime-refreshable)
let runtimeToken: string = process.env.BOX_DEVELOPER_TOKEN ?? "";

export function setBoxToken(token: string) {
  runtimeToken = token;
}

async function boxRequest(path: string, options: RequestInit = {}) {
  const res = await fetch(`https://api.box.com/2.0${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${runtimeToken}`,
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Box ${path} → ${res.status}: ${await res.text()}`);
  return res;
}

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
  // Always create under BOX_CANDIDATES_ROOT_ID — never under the common folder
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

// Upload to the common docs folder
export async function uploadCommonFile(fileName: string, content: Buffer) {
  const folderId = process.env.BOX_COMMON_FOLDER_ID!;
  return uploadFile(folderId, fileName, content);
}

// Upload to a specific candidate's folder — strict isolation
export async function uploadCandidateFile(candidateBoxFolderId: string, fileName: string, content: Buffer) {
  // Validate this is actually a candidate folder (must be under BOX_CANDIDATES_ROOT_ID)
  const folderInfo = await boxRequest(`/folders/${candidateBoxFolderId}`);
  const info = await folderInfo.json();
  const parentId = info?.parent?.id;
  if (parentId !== process.env.BOX_CANDIDATES_ROOT_ID) {
    throw new Error(`Security: folder ${candidateBoxFolderId} is not a candidate folder`);
  }
  return uploadFile(candidateBoxFolderId, fileName, content);
}

async function extractTextViaBoxRepresentation(fileId: string, fileName: string): Promise<string | null> {
  try {
    const infoRes = await boxRequest(`/files/${fileId}?fields=representations`, {
      headers: { "X-Rep-Hints": "[extracted_text]" },
    });
    const info = await infoRes.json();
    const entries: Array<{ representation: string; status: { state: string }; content: { url_template: string } }> =
      info.representations?.entries ?? [];
    const textRep = entries.find((e) => e.representation === "extracted_text");

    if (!textRep || textRep.status.state === "none") return null;
    if (textRep.status.state === "pending") await new Promise((r) => setTimeout(r, 3000));

    const contentUrl = textRep.content.url_template.replace("{+asset_path}", "");
    const textRes = await fetch(contentUrl, { headers: { Authorization: `Bearer ${runtimeToken}` } });
    if (!textRes.ok) return null;

    const text = await textRes.text();
    if (text.trim().length > 50) {
      console.log(`[box] extracted text via representation for ${fileName}: ${text.length} chars`);
      return text;
    }
    return null;
  } catch (e) {
    console.warn(`[box] text representation failed for ${fileName}:`, e);
    return null;
  }
}

export async function getFileContent(fileId: string, fileName: string): Promise<string> {
  const lowerName = fileName.toLowerCase();
  const useBoxExtraction = lowerName.endsWith(".pdf") || lowerName.endsWith(".docx") || lowerName.endsWith(".doc");

  if (useBoxExtraction) {
    const text = await extractTextViaBoxRepresentation(fileId, fileName);
    if (text) return text;
  }

  // Download raw content
  const dlRes = await boxRequest(`/files/${fileId}/content`);
  const buffer = Buffer.from(await dlRes.arrayBuffer());

  if (lowerName.endsWith(".pdf")) {
    const raw = buffer.toString("latin1");
    const textMatches = raw.match(/\(([^)]{2,200})\)/g) ?? [];
    const extracted = textMatches
      .map((m) => m.slice(1, -1).replace(/\\n/g, "\n").replace(/\\t/g, " "))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (extracted.length > 100) {
      console.log(`[box] fallback extract for ${fileName}: ${extracted.length} chars`);
      return extracted;
    }
    return buffer.toString("utf-8").replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s+/g, " ").trim();
  }

  return buffer.toString("utf-8");
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
