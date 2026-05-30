import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSignRequest, getSignRequest, cancelSignRequest } from "@/lib/box";

// POST — send offer letter for e-signature via Box Sign
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { fileId } = await request.json();

  if (!fileId) return NextResponse.json({ error: "fileId required" }, { status: 400 });

  const candidate = await prisma.candidate.findUnique({ where: { id } });
  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!candidate.boxFolderId) return NextResponse.json({ error: "No Box folder for candidate" }, { status: 400 });

  const signRequest = await createSignRequest({
    signerEmail: candidate.email,
    signerName: candidate.name,
    fileId,
    parentFolderId: candidate.boxFolderId,
    emailSubject: `Your offer letter from Acme — please sign`,
    emailMessage: `Hi ${candidate.name.split(" ")[0]}, your offer letter is ready. Please review and sign at your convenience. Reach out to your recruiter with any questions.`,
    redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/candidate?token=${candidate.magicToken}`,
  });

  // Track in activity log
  await prisma.candidateActivity.create({
    data: {
      candidateId: id,
      type: "SIGN_REQUEST_SENT",
      description: `Offer letter sent for e-signature via Box Sign`,
      metadata: { signRequestId: signRequest.id, fileId },
    },
  });

  return NextResponse.json(signRequest);
}

// GET — check sign request status
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const signRequestId = request.nextUrl.searchParams.get("signRequestId");
  if (!signRequestId) return NextResponse.json({ error: "signRequestId required" }, { status: 400 });

  const status = await getSignRequest(signRequestId);
  return NextResponse.json(status);
}

// DELETE — cancel a pending sign request
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { signRequestId } = await request.json();
  await cancelSignRequest(signRequestId);
  return NextResponse.json({ success: true });
}
