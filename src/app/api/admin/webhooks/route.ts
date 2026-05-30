import { NextRequest, NextResponse } from "next/server";
import { registerWebhook, listWebhooks, deleteWebhook } from "@/lib/box";

// GET — list all registered Box webhooks
export async function GET() {
  const webhooks = await listWebhooks();
  return NextResponse.json(webhooks);
}

// POST — register webhooks on both the common folder and candidates root
export async function POST(request: NextRequest) {
  const { appUrl } = await request.json();
  const callbackUrl = `${appUrl ?? process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/box`;

  const results = await Promise.allSettled([
    registerWebhook(process.env.BOX_COMMON_FOLDER_ID!, callbackUrl),
    registerWebhook(process.env.BOX_CANDIDATES_ROOT_ID!, callbackUrl),
  ]);

  const webhooks = results.map((r, i) => ({
    folder: i === 0 ? "common" : "candidates",
    status: r.status,
    data: r.status === "fulfilled" ? r.value : (r as PromiseRejectedResult).reason?.message,
  }));

  console.log("[webhooks] registered:", webhooks);
  return NextResponse.json({ webhooks, callbackUrl });
}

// DELETE — remove a webhook
export async function DELETE(request: NextRequest) {
  const { webhookId } = await request.json();
  await deleteWebhook(webhookId);
  return NextResponse.json({ success: true });
}
