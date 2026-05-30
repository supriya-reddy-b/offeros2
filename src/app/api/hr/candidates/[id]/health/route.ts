import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeOfferHealth } from "@/lib/offer-health";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const candidate = await prisma.candidate.findUnique({
    where: { id },
    include: {
      escalations: { orderBy: { createdAt: "desc" } },
      activities: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });

  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const daysSinceOffer = Math.floor(
    (Date.now() - new Date(candidate.createdAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  const result = await computeOfferHealth({
    candidateName: candidate.name,
    role: candidate.role,
    status: candidate.status,
    daysSinceOffer,
    escalations: candidate.escalations.map((e: { question: string; category: string; priority: string; status: string; createdAt: Date }) => ({
      question: e.question,
      category: e.category,
      priority: e.priority,
      status: e.status,
      createdAt: e.createdAt.toISOString(),
    })),
    activities: candidate.activities.map((a: { type: string; description: string; createdAt: Date }) => ({
      type: a.type,
      description: a.description,
      createdAt: a.createdAt.toISOString(),
    })),
  });

  return NextResponse.json(result);
}
