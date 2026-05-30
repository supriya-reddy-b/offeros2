import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { collectCandidateIntelligence } from "@/lib/apify";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ candidateId: string }> }) {
  const { candidateId } = await params;

  const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const intel = await collectCandidateIntelligence(candidate.name, candidate.email);

  const record = await prisma.candidateIntelligence.upsert({
    where: { candidateId },
    create: {
      candidateId,
      interests: intel.interests,
      recentActivity: intel.recentActivity,
      suggestedTalkingPoints: intel.suggestedTalkingPoints,
      githubData: intel.githubData || {},
      linkedinData: intel.linkedinData || {},
    },
    update: {
      interests: intel.interests,
      recentActivity: intel.recentActivity,
      suggestedTalkingPoints: intel.suggestedTalkingPoints,
      githubData: intel.githubData || {},
      linkedinData: intel.linkedinData || {},
      updatedAt: new Date(),
    },
  });

  return NextResponse.json(record);
}
