import { NextRequest, NextResponse } from "next/server";
import { setBoxToken } from "@/lib/box";
import { setBoxAIToken } from "@/lib/box-ai";

export async function POST(request: NextRequest) {
  const { token } = await request.json();
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });
  setBoxToken(token);
  setBoxAIToken(token); // keep box-ai.ts in sync
  return NextResponse.json({ ok: true });
}
