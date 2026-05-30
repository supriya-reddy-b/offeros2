import BoxSDK from "box-node-sdk";

let boxClient: ReturnType<typeof BoxSDK.prototype.getBasicClient> | null = null;

export function getBoxClient() {
  if (!boxClient) {
    const sdk = new BoxSDK({
      clientID: process.env.BOX_CLIENT_ID!,
      clientSecret: process.env.BOX_CLIENT_SECRET!,
    });
    boxClient = sdk.getBasicClient(process.env.BOX_DEVELOPER_TOKEN!);
  }
  return boxClient;
}

export async function createCandidateFolder(candidateName: string, candidateId: string) {
  const client = getBoxClient();
  const parentFolderId = process.env.BOX_COMMON_FOLDER_ID || "0";
  const folder = await client.folders.create(parentFolderId, `${candidateName} (${candidateId})`);
  return folder.id;
}

export async function getCommonDocuments() {
  const client = getBoxClient();
  const folderId = process.env.BOX_COMMON_FOLDER_ID || "0";
  const items = await client.folders.getItems(folderId, { fields: "id,name,size,created_at,modified_at" });
  return items.entries.filter((item: { type: string }) => item.type === "file");
}

export async function getCandidateDocuments(boxFolderId: string) {
  const client = getBoxClient();
  const items = await client.folders.getItems(boxFolderId, { fields: "id,name,size,created_at,modified_at" });
  return items.entries.filter((item: { type: string }) => item.type === "file");
}

async function getRawBuffer(fileId: string): Promise<Buffer> {
  const client = getBoxClient();
  return new Promise((resolve, reject) => {
    client.files.getReadStream(fileId, {}, (err: Error | null, stream: NodeJS.ReadableStream) => {
      if (err) return reject(err);
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });
  });
}

// Use Box's extracted_text representation for PDFs — no local PDF parsing needed
async function getBoxTextRepresentation(fileId: string): Promise<string | null> {
  const token = process.env.BOX_DEVELOPER_TOKEN!;

  // Request the extracted_text representation
  const infoRes = await fetch(`https://api.box.com/2.0/files/${fileId}?fields=representations`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Rep-Hints": "[extracted_text]",
    },
  });

  if (!infoRes.ok) return null;

  const info = await infoRes.json();
  const entries: Array<{ representation: string; status: { state: string }; content: { url_template: string } }> =
    info.representations?.entries ?? [];

  const textRep = entries.find((e) => e.representation === "extracted_text");
  if (!textRep || textRep.status.state === "none") return null;

  // If not ready yet, wait up to 10s
  if (textRep.status.state === "pending" || textRep.status.state === "viewable") {
    await new Promise((r) => setTimeout(r, 3000));
  }

  const contentUrl = textRep.content.url_template.replace("{+asset_path}", "");
  const textRes = await fetch(contentUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!textRes.ok) return null;
  return textRes.text();
}

export async function getFileContent(fileId: string, fileName: string): Promise<string> {
  const lowerName = fileName.toLowerCase();

  if (lowerName.endsWith(".pdf")) {
    // Try Box's native text extraction first
    try {
      const text = await getBoxTextRepresentation(fileId);
      if (text && text.trim().length > 50) {
        console.log(`[box] extracted text via Box API for ${fileName}: ${text.length} chars`);
        return text;
      }
    } catch (e) {
      console.warn(`[box] text representation failed for ${fileName}:`, e);
    }

    // Fallback: download raw bytes and strip non-printable chars
    // This works for text-based PDFs but may produce noise for scanned PDFs
    const buffer = await getRawBuffer(fileId);
    const raw = buffer.toString("latin1");
    // Extract readable text runs from the PDF stream
    const textMatches = raw.match(/\(([^)]{2,200})\)/g) ?? [];
    const extracted = textMatches
      .map((m) => m.slice(1, -1).replace(/\\n/g, "\n").replace(/\\t/g, " "))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (extracted.length > 100) {
      console.log(`[box] extracted text via fallback for ${fileName}: ${extracted.length} chars`);
      return extracted;
    }

    // Last resort: return raw printable ASCII
    return buffer.toString("utf-8").replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s+/g, " ").trim();
  }

  // Plain text files
  const buffer = await getRawBuffer(fileId);
  return buffer.toString("utf-8");
}

export async function uploadFile(folderId: string, fileName: string, content: Buffer) {
  const client = getBoxClient();
  const file = await client.files.uploadFile(folderId, fileName, content);
  return file.entries[0];
}

export async function deleteFile(fileId: string) {
  const client = getBoxClient();
  await client.files.delete(fileId);
}
