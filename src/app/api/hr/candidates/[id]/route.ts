import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCandidateDocuments } from "@/lib/box";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const candidate = await prisma.candidate.findUnique({
    where: { id },
    include: {
      escalations: { orderBy: { createdAt: "desc" } },
      activities: { orderBy: { createdAt: "desc" }, take: 20 },
      intelligence: true,
      conversations: {
        include: {
          messages: { orderBy: { createdAt: "asc" }, take: 5 },
        },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
  });

  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  let documents: unknown[] = [];
  if (candidate.boxFolderId) {
    try {
      documents = await getCandidateDocuments(candidate.boxFolderId);
    } catch {
      documents = [];
    }
  }

  return NextResponse.json({ ...candidate, documents });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();

  const candidate = await prisma.candidate.update({
    where: { id },
    data: body,
  });

  return NextResponse.json(candidate);
}
