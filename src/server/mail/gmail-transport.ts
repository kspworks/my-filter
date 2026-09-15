import { createTransport, type Transporter } from "nodemailer";
import type { MailMessage, MailTransport } from "~/server/mail/transport";

export type GmailConfig = {
  user: string;
  appPassword: string;
  from: string;
};

/**
 * Gmail's submission endpoint. Implicit TLS on 465 rather than STARTTLS on 587:
 * one fewer round trip, and no plaintext window at all.
 *
 * The timeouts are set explicitly because nodemailer defaults them to two
 * minutes — longer than the serverless function this runs in is allowed to
 * live, so a hung connection would look like a silent failure rather than an
 * error. One pooled connection serves the whole run instead of a fresh
 * handshake per recipient.
 */
export const GMAIL_SMTP = {
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 20_000,
  pool: true,
  maxConnections: 1,
} as const;

/** The seam the test drives: in production this is nodemailer's own factory. */
export type CreateTransporter = (
  options: Record<string, unknown>,
) => Transporter;

// nodemailer is imported at the top of this module rather than inside the
// factory: `create-transport` only ever reaches this file through a dynamic
// import, so `MAIL_TRANSPORT=log` never loads either of them.
const defaultFactory: CreateTransporter = (options) => createTransport(options);

export function createGmailTransport(
  config: GmailConfig,
  createTransporter: CreateTransporter = defaultFactory,
): MailTransport {
  const transporter = createTransporter({
    ...GMAIL_SMTP,
    auth: { user: config.user, pass: config.appPassword },
  });

  return {
    name: "gmail",
    async send(message: MailMessage) {
      await transporter.sendMail({
        from: config.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    },
    async close() {
      transporter.close();
    },
  };
}
