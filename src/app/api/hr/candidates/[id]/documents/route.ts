import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uploadCandidateFile, deleteFile, getCandidateDocuments } from "@/lib/box";
import { extractOfferTerms, checkDocumentHealth, writeBoxMetadata } from "@/lib/box-ai";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const candidate = await prisma.candidate.findUnique({ where: { id } });
  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const dbDocs = await prisma.candidateDocument.findMany({
    where: { candidateId: id },
    orderBy: { uploadedAt: "desc" },
  });

  let boxDocs: { id: string; name: string; size: number; created_at: string }[] = [];
  if (candidate.boxFolderId) {
    try {
      boxDocs = await getCandidateDocuments(candidate.boxFolderId) as unknown as typeof boxDocs;
    } catch { boxDocs = []; }
  }

  return NextResponse.json({ dbDocs, boxDocs, boxFolderId: candidate.boxFolderId });
}

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

      if (/\.docx?$/i.test(fileName)) {
        const { convertDocxToPdf } = await import("@/lib/docx-convert");
        const converted = await convertDocxToPdf(buffer, fileName);
        buffer = converted.buffer;
        fileName = converted.name;
      }

      const uploaded = await uploadCandidateFile(candidate.boxFolderId!, fileName, buffer);

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

      // Run Box AI processing async — don't block the upload response
      processWithBoxAI(uploaded.id, docType, candidate.name, candidate.role, id, dbDoc.id)
        .catch((e) => console.error("[box-ai] async processing failed:", e));

    } catch (err) {
      console.error(`Upload failed for ${file.name}:`, err);
    }
  }

  return NextResponse.json(results, { status: 201 });
}

async function processWithBoxAI(
  fileId: string,
  docType: string,
  candidateName: string,
  role: string,
  candidateId: string,
  dbDocId: string
) {
  console.log(`[box-ai] processing ${docType} file ${fileId}`);

  // Run extraction and health check in parallel
  const [terms, health] = await Promise.allSettled([
    docType === "OFFER_LETTER" || docType === "EQUITY_GRANT" || docType === "COMPENSATION_BREAKDOWN"
      ? extractOfferTerms(fileId)
      : Promise.resolve(null),
    checkDocumentHealth(fileId, docType),
  ]);

  const extractedTerms = terms.status === "fulfilled" ? terms.value : null;
  const healthResult = health.status === "fulfilled" ? health.value : null;

  // Write metadata back to Box file
  if (extractedTerms && healthResult) {
    await writeBoxMetadata(fileId, extractedTerms, healthResult, docType);
  }

  // Store results in DB on the document record
  if (extractedTerms || healthResult) {
    await prisma.candidateDocument.update({
      where: { id: dbDocId },
      data: {
        // Store AI analysis as JSON in a metadata field
        // We'll add this column via migration below
      },
    }).catch(() => {}); // non-fatal if column doesn't exist yet
  }

  // Log as candidate activity so HR can see the AI processed it
  if (healthResult) {
    const statusMsg = healthResult.status === "complete"
      ? `✓ Document complete (${healthResult.score}/100)`
      : healthResult.missing.length > 0
      ? `⚠ Missing: ${healthResult.missing.slice(0, 2).join(", ")}${healthResult.missing.length > 2 ? ` +${healthResult.missing.length - 2} more` : ""}`
      : `Document processed (${healthResult.score}/100)`;

    await prisma.candidateActivity.create({
      data: {
        candidateId,
        type: "DOCUMENT_PROCESSED",
        description: `Box AI analysed ${docType.replace(/_/g, " ")}: ${statusMsg}`,
        metadata: JSON.parse(JSON.stringify({
          fileId,
          docType,
          healthScore: healthResult.score,
          healthStatus: healthResult.status,
          missing: healthResult.missing,
          warnings: healthResult.warnings,
          extractedTerms: extractedTerms ?? {},
        })),
      },
    });
  }

  console.log(`[box-ai] finished processing ${fileId} — health: ${healthResult?.status ?? "unknown"}`);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boxFileId } = await request.json();

  const doc = await prisma.candidateDocument.findFirst({
    where: { candidateId: id, boxFileId },
  });

  if (!doc) return NextResponse.json({ error: "Document not found or not owned by this candidate" }, { status: 404 });

  await deleteFile(boxFileId);
  await prisma.candidateDocument.delete({ where: { id: doc.id } });

  return NextResponse.json({ success: true });
}
