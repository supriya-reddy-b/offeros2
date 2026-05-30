import { NextRequest, NextResponse } from "next/server";
import { setBoxToken } from "@/lib/box";

export async function POST(request: NextRequest) {
  const { token } = await request.json();
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });
  setBoxToken(token);
  return NextResponse.json({ ok: true });
}
