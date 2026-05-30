import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();

  // Check if already responded — prevent duplicate messages on double-submit
  const existing = await prisma.escalation.findUnique({ where: { id } });
  if (existing?.hrResponse && body.hrResponse) {
    return NextResponse.json({ error: "Already responded" }, { status: 409 });
  }

  const escalation = await prisma.escalation.update({
    where: { id },
    data: {
      ...body,
      ...(body.hrResponse && { status: "RESOLVED", respondedAt: new Date() }),
    },
    include: { candidate: true },
  });

  // When HR sends a response, push it into the candidate's conversation
  if (body.hrResponse) {
    // Find the candidate's most recent conversation, or create one
    let conversation = await prisma.conversation.findFirst({
      where: { candidateId: escalation.candidateId },
      orderBy: { updatedAt: "desc" },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: { candidateId: escalation.candidateId },
      });
    }

    // Add the original question back as context, then the HR reply
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "ASSISTANT",
        content: `**Your recruiter replied to your question:** "${escalation.question}"\n\n${body.hrResponse}`,
        classification: "GREEN",
      },
    });

    // Send email notification to candidate
    if (process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL}/candidate?token=${escalation.candidate.magicToken}`;

        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL!,
          to: escalation.candidate.email,
          subject: `Your recruiter answered your question`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
              <h2 style="color: #1a1a1a;">Hi ${escalation.candidate.name},</h2>
              <p style="color: #444;">Your recruiter has responded to your question.</p>
              <div style="background: #f5f5f5; border-left: 3px solid #6366f1; padding: 12px 16px; margin: 16px 0; color: #555; font-style: italic;">
                "${escalation.question}"
              </div>
              <div style="background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0; color: #333;">
                ${body.hrResponse}
              </div>
              <a href="${portalUrl}" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px; font-size: 15px;">
                View in Portal
              </a>
            </div>
          `,
        });
      } catch (e) {
        console.error("Candidate email notification failed:", e);
      }
    }
  }

  return NextResponse.json(escalation);
}
