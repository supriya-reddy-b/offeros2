import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  const candidate = await prisma.candidate.findUnique({
    where: { magicToken: token },
  });

  if (!candidate) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  if (candidate.magicTokenExpiry && candidate.magicTokenExpiry < new Date()) {
    return NextResponse.json({ error: "Token expired" }, { status: 401 });
  }

  // Update status to ACTIVE on first login
  if (candidate.status === "INVITED") {
    await prisma.candidate.update({
      where: { id: candidate.id },
      data: { status: "ACTIVE" },
    });

    await prisma.candidateActivity.create({
      data: {
        candidateId: candidate.id,
        type: "LOGIN",
        description: "First portal access",
      },
    });
  }

  return NextResponse.json({
    id: candidate.id,
    name: candidate.name,
    email: candidate.email,
    role: candidate.role,
    status: candidate.status,
    boxFolderId: candidate.boxFolderId,
  });
}
