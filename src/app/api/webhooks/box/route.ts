import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Box calls this endpoint when files change in watched folders.
// We use it to track document activity and invalidate stale state.

export async function POST(request: NextRequest) {
  const body = await request.json();

  const trigger = body.trigger as string;          // e.g. "FILE.UPLOADED"
  const source = body.source as { id: string; type: string; name?: string; parent?: { id: string } };
  const createdBy = body.created_by as { id: string; name?: string } | undefined;

  console.log(`[webhook/box] ${trigger} — ${source.type} "${source.name}" (id: ${source.id})`);

  // Handle file events in candidate folders
  if (source.type === "file" && source.parent?.id) {
    const parentFolderId = source.parent.id;
    const candidatesRootId = process.env.BOX_CANDIDATES_ROOT_ID!;

    // Check if this file belongs to a candidate folder
    const candidate = await prisma.candidate.findFirst({
      where: { boxFolderId: parentFolderId },
    });

    if (candidate) {
      if (trigger === "FILE.UPLOADED") {
        // Track as activity
        await prisma.candidateActivity.create({
          data: {
            candidateId: candidate.id,
            type: "DOCUMENT_UPLOADED",
            description: `Document uploaded: ${source.name ?? source.id}`,
            metadata: { fileId: source.id, fileName: source.name, uploadedBy: createdBy?.name },
          },
        }).catch(() => {}); // non-fatal
      }

      if (trigger === "FILE.DELETED") {
        // Remove from CandidateDocument tracking if present
        await prisma.candidateDocument.deleteMany({
          where: { candidateId: candidate.id, boxFileId: source.id },
        }).catch(() => {});

        console.log(`[webhook/box] removed tracking for deleted file ${source.id} (candidate: ${candidate.name})`);
      }
    } else if (parentFolderId === process.env.BOX_COMMON_FOLDER_ID) {
      console.log(`[webhook/box] common folder event: ${trigger} on "${source.name}"`);
      // Common docs changed — could invalidate a cache here if we add one later
    }

    void candidatesRootId; // used for context
  }

  // Box requires a 200 response or it will retry
  return NextResponse.json({ received: true });
}
