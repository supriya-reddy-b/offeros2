import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uploadCandidateFile, deleteFile, getCandidateDocuments } from "@/lib/box";

// GET — list candidate-specific docs (from Box + DB metadata)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const candidate = await prisma.candidate.findUnique({ where: { id } });
  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Get tracked docs from DB
  const dbDocs = await prisma.candidateDocument.findMany({
    where: { candidateId: id },
    orderBy: { uploadedAt: "desc" },
  });

  // Also list directly from Box in case anything was uploaded outside the portal
  let boxDocs: { id: string; name: string; size: number; created_at: string }[] = [];
  if (candidate.boxFolderId) {
    try {
      boxDocs = await getCandidateDocuments(candidate.boxFolderId) as unknown as typeof boxDocs;
    } catch {
      boxDocs = [];
    }
  }

  return NextResponse.json({ dbDocs, boxDocs, boxFolderId: candidate.boxFolderId });
}

// POST — upload one or more candidate-specific docs
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const candidate = await prisma.candidate.findUnique({ where: { id } });
  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!candidate.boxFolderId) return NextResponse.json({ error: "Candidate has no Box folder" }, { status: 400 });

  const formData = await request.formData();
  const files = formData.getAll("file") as File[];
  const docType = (formData.get("docType") as string) || "OTHER";

  if (!files.length) return NextResponse.json({ error: "No files provided" }, { status: 400 });

  const results = [];

  for (const file of files) {
    try {
      let buffer = Buffer.from(await file.arrayBuffer()) as Buffer;
      let fileName = file.name;

      // Convert docx to PDF
      if (/\.docx?$/i.test(fileName)) {
        const { convertDocxToPdf } = await import("@/lib/docx-convert");
        const converted = await convertDocxToPdf(buffer, fileName);
        buffer = converted.buffer;
        fileName = converted.name;
      }

      // Upload strictly to candidate's folder
      const uploaded = await uploadCandidateFile(candidate.boxFolderId!, fileName, buffer);

      // Track in DB with doc type
      const dbDoc = await prisma.candidateDocument.create({
        data: {
          candidateId: id,
          boxFileId: uploaded.id,
          fileName,
          fileSize: file.size,
          docType: docType as "OFFER_LETTER" | "EQUITY_GRANT" | "COMPENSATION_BREAKDOWN" | "TEAM_OVERVIEW" | "ROLE_DETAILS" | "RELOCATION" | "OTHER",
        },
      });

      results.push(dbDoc);
    } catch (err) {
      console.error(`Upload failed for ${file.name}:`, err);
    }
  }

  return NextResponse.json(results, { status: 201 });
}

// DELETE — remove a candidate-specific doc
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boxFileId } = await request.json();

  // Verify this file belongs to this candidate before deleting
  const doc = await prisma.candidateDocument.findFirst({
    where: { candidateId: id, boxFileId },
  });

  if (!doc) return NextResponse.json({ error: "Document not found or not owned by this candidate" }, { status: 404 });

  await deleteFile(boxFileId);
  await prisma.candidateDocument.delete({ where: { id: doc.id } });

  return NextResponse.json({ success: true });
}
