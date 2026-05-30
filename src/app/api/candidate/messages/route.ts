import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const candidateId = request.nextUrl.searchParams.get("candidateId");
  if (!candidateId) return NextResponse.json({ messages: [], conversationId: null });

  const conversation = await prisma.conversation.findFirst({
    where: { candidateId },
    orderBy: { updatedAt: "desc" },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  return NextResponse.json({
    messages: conversation?.messages ?? [],
    conversationId: conversation?.id ?? null,
  });
}
