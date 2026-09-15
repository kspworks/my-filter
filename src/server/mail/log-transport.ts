import type { MailMessage, MailTransport } from "~/server/mail/transport";

/**
 * Writes the email to the log instead of sending it.
 *
 * The default everywhere no mail secrets exist — `pnpm dev`, CI, a fresh clone —
 * so the failure mode of a forgotten production variable is a logged message
 * rather than a crash at 09:00 UTC.
 */
export function createLogTransport(
  write: (line: string) => void = console.info,
): MailTransport {
  return {
    name: "log",
    async send(message: MailMessage) {
      write(
        [
          `[mail] to ${message.to}`,
          `[mail] subject: ${message.subject}`,
          message.text,
        ].join("\n"),
      );
    },
  };
}
