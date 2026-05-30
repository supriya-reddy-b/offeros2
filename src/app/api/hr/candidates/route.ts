import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createCandidateFolder } from "@/lib/box";
import { generateMagicToken, getMagicTokenExpiry } from "@/lib/utils";
import { sendMagicLink } from "@/lib/resend";
import { collectCandidateIntelligence } from "@/lib/apify";

export async function GET() {
  const candidates = await prisma.candidate.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      escalations: { where: { status: { not: "RESOLVED" } } },
      _count: { select: { activities: true } },
    },
  });

  return NextResponse.json(candidates);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, email, role } = body;

  if (!name || !email || !role) {
    return NextResponse.json({ error: "name, email, and role are required" }, { status: 400 });
  }

  const token = generateMagicToken();
  const tokenExpiry = getMagicTokenExpiry();

  let boxFolderId: string | undefined;
  try {
    const candidateId = `temp-${Date.now()}`;
    boxFolderId = await createCandidateFolder(name, candidateId);
  } catch {
    console.error("Box folder creation failed — continuing without folder");
  }

  const candidate = await prisma.candidate.create({
    data: {
      name,
      email,
      role,
      boxFolderId,
      magicToken: token,
      magicTokenExpiry: tokenExpiry,
    },
  });

  try {
    await sendMagicLink(email, name, token);
  } catch {
    console.error("Email send failed");
  }

  // Kick off intelligence collection asynchronously
  collectCandidateIntelligence(name, email)
    .then(async (intel) => {
      await prisma.candidateIntelligence.create({
        data: {
          candidateId: candidate.id,
          interests: intel.interests,
          recentActivity: intel.recentActivity,
          suggestedTalkingPoints: intel.suggestedTalkingPoints,
          githubData: intel.githubData || {},
          linkedinData: intel.linkedinData || {},
        },
      });
    })
    .catch(console.error);

  return NextResponse.json(candidate, { status: 201 });
}
