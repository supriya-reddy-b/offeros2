import { Resend } from "resend";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

export async function sendMagicLink(candidateEmail: string, candidateName: string, magicToken: string) {
  const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL}/candidate?token=${magicToken}`;

  await getResend().emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: candidateEmail,
    subject: "Your Offer Portal Access",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="color: #1a1a1a; font-size: 24px;">Hi ${candidateName},</h1>
        <p style="color: #444; font-size: 16px; line-height: 1.6;">
          Your personalized offer portal is ready. You can review your offer documents and ask questions — all in one place.
        </p>
        <a href="${portalUrl}" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 500;">
          Access Your Offer Portal
        </a>
        <p style="color: #888; font-size: 14px;">This link expires in 7 days and is unique to you.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #aaa; font-size: 12px;">If you have questions, reply to this email or reach out to your recruiter.</p>
      </div>
    `,
  });
}

export async function sendEscalationNotification(
  hrEmail: string,
  candidateName: string,
  candidateId: string,
  question: string,
  category: string
) {
  const profileUrl = `${process.env.NEXT_PUBLIC_APP_URL}/hr/candidates/${candidateId}`;

  await getResend().emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: hrEmail,
    subject: `Offer question from ${candidateName} — ${category}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color: #1a1a1a;">${candidateName} has a question</h2>
        <p style="color: #444; font-size: 15px;"><strong>Category:</strong> ${category}</p>
        <blockquote style="border-left: 3px solid #6366f1; padding-left: 16px; color: #444; font-style: italic;">
          "${question}"
        </blockquote>
        <a href="${profileUrl}" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px; font-size: 15px;">
          View Candidate Profile
        </a>
      </div>
    `,
  });
}
