import nodemailer, { type Transporter } from "nodemailer";
import { requireEnv } from "./config.js";

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  const user = requireEnv("GMAIL_USER");
  const pass = requireEnv("GMAIL_APP_PASSWORD");
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  return transporter;
}

export interface SendArgs {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
}

/** Gmail SMTP 로 메일을 발송한다. */
export async function sendMail(args: SendArgs): Promise<string> {
  const user = requireEnv("GMAIL_USER");
  const fromName = process.env.MAIL_FROM_NAME?.trim() || "AI 인사이트";

  const info = await getTransporter().sendMail({
    from: `"${fromName}" <${user}>`,
    to: args.to.join(", "),
    cc: args.cc && args.cc.length ? args.cc.join(", ") : undefined,
    subject: args.subject,
    html: args.html,
  });
  return info.messageId;
}

/** 시작 시 SMTP 연결/인증을 검증한다. (실 발송 전 빠른 실패용) */
export async function verifyMailer(): Promise<void> {
  await getTransporter().verify();
}
