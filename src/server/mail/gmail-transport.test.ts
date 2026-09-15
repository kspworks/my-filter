import { createTransport, type Transporter } from "nodemailer";
import { describe, expect, it, vi } from "vitest";
import {
  type CreateTransporter,
  createGmailTransport,
  GMAIL_SMTP,
} from "~/server/mail/gmail-transport";

/**
 * Nothing here opens a socket. What is worth pinning is the shape of the
 * handover to nodemailer — the one place an upgrade can change behaviour
 * silently, because a wrong option is ignored rather than rejected.
 */

const CONFIG = {
  user: "bot@example.com",
  appPassword: "abcd efgh ijkl mnop",
  from: "My Filter <bot@example.com>",
};

const MESSAGE = {
  to: "alice@example.com",
  subject: "1 cartridge needs replacing",
  text: "Replace now",
  html: "<p>Replace now</p>",
};

function spyFactory() {
  const sendMail = vi.fn().mockResolvedValue({ messageId: "1" });
  const close = vi.fn();
  const createTransporter = vi.fn(
    () => ({ sendMail, close }) as unknown as Transporter,
  ) satisfies CreateTransporter;
  return { sendMail, close, createTransporter };
}

describe("createGmailTransport", () => {
  it("connects over implicit TLS, with timeouts shorter than the function's", () => {
    const { createTransporter } = spyFactory();

    createGmailTransport(CONFIG, createTransporter);

    expect(createTransporter).toHaveBeenCalledWith({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      pool: true,
      maxConnections: 1,
      auth: { user: CONFIG.user, pass: CONFIG.appPassword },
    });
  });

  it("sends both parts, from the configured address", async () => {
    const { sendMail, createTransporter } = spyFactory();

    await createGmailTransport(CONFIG, createTransporter).send(MESSAGE);

    expect(sendMail).toHaveBeenCalledWith({
      from: CONFIG.from,
      to: MESSAGE.to,
      subject: MESSAGE.subject,
      text: MESSAGE.text,
      html: MESSAGE.html,
    });
  });

  it("releases the connection", async () => {
    const { close, createTransporter } = spyFactory();

    await createGmailTransport(CONFIG, createTransporter).close?.();

    // An idle pooled socket keeps a serverless function billable to its timeout.
    expect(close).toHaveBeenCalledOnce();
  });

  it("hands real nodemailer options it still understands", async () => {
    // The dependency-upgrade canary. Every case above talks to a spy, which
    // would happily accept options nodemailer had renamed or dropped — a
    // silently ignored option is exactly how this feature would fail at 09:00
    // UTC with nothing in the logs. So build a real transporter (constructing
    // only; nothing connects until `sendMail`) and read back what it kept.
    const built = createTransport({
      ...GMAIL_SMTP,
      auth: { user: CONFIG.user, pass: CONFIG.appPassword },
    });

    try {
      const options = (built as unknown as { options: Record<string, unknown> })
        .options;
      expect(options).toMatchObject({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        connectionTimeout: 10_000,
        socketTimeout: 20_000,
      });
      // `pool: true` is the one option whose effect is visible rather than
      // merely stored: it decides which implementation gets built.
      expect(
        (built as unknown as { transporter: object }).transporter.constructor
          .name,
      ).toBe("SMTPPool");
    } finally {
      built.close();
    }
  });
});
