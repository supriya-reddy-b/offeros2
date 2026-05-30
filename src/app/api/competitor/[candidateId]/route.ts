import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { collectCompetitorIntelligence } from "@/lib/competitor-intel";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ candidateId: string }> }) {
  const { candidateId } = await params;
  const intel = await prisma.competitorIntelligence.findUnique({ where: { candidateId } });
  return NextResponse.json(intel);
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ candidateId: string }> }) {
  const { candidateId } = await params;

  const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const intel = await collectCompetitorIntelligence(candidate.role, candidate.name);

  // Cast to any for Prisma JSON fields
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {
    role: intel.role,
    competitors: intel.competitors,
    salaryBenchmarks: intel.salaryBenchmarks,
    jobPostings: intel.jobPostings,
    glassdoorData: intel.glassdoorData,
    linkedinInsights: intel.jobPostings,
    positioningAdvice: intel.positioningAdvice,
    sources: intel.sources,
  };

  const record = await prisma.competitorIntelligence.upsert({
    where: { candidateId },
    create: { candidateId, ...data },
    update: { ...data, updatedAt: new Date() },
  });

  return NextResponse.json(record);
}
