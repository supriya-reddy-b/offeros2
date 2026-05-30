import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractOfferTerms, checkDocumentHealth, writeBoxMetadata } from "@/lib/box-ai";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const { id, fileId } = await params;

  const doc = await prisma.candidateDocument.findFirst({
    where: { candidateId: id, boxFileId: fileId },
    include: { candidate: true },
  });

  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const [terms, health] = await Promise.all([
    extractOfferTerms(fileId),
    checkDocumentHealth(fileId, doc.docType),
  ]);

  await writeBoxMetadata(fileId, terms, health, doc.docType);

  return NextResponse.json({ terms, health, docType: doc.docType });
}
