import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateCandidateBrief } from "@/lib/openai";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ candidateId: string }> }) {
  const { candidateId } = await params;

  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    include: {
      escalations: true,
      activities: { orderBy: { createdAt: "desc" }, take: 20 },
      intelligence: true,
    },
  });

  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const questions = candidate.activities
    .filter((a: { type: string }) => a.type === "QUESTION")
    .map((a: { description: string }) => a.description);

  const escalations = candidate.escalations.map((e: { question: string }) => e.question);

  const documentsViewed = candidate.activities
    .filter((a: { type: string }) => a.type === "DOCUMENT_VIEW")
    .map((a: { description: string }) => a.description);

  const intel = candidate.intelligence;

  const brief = await generateCandidateBrief({
    name: candidate.name,
    role: candidate.role,
    questions,
    escalations,
    documentsViewed,
    intelligence: intel
      ? {
          interests: intel.interests as string[],
          recentActivity: intel.recentActivity as string[],
        }
      : undefined,
  });

  return NextResponse.json({ brief });
}
