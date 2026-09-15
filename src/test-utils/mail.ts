import type { MailMessage, MailTransport } from "~/server/mail/transport";

/**
 * The one test double in the notification feature, and it implements the same
 * `MailTransport` the production code does — so a change to that interface
 * breaks here rather than at 09:00 UTC.
 */

export type MemoryTransport = {
  transport: MailTransport;
  sent: MailMessage[];
  /** Make the next `send` reject, to exercise the compensating delete. */
  failNext: (error?: Error) => void;
  closed: () => number;
};

export function createMemoryTransport(): MemoryTransport {
  const sent: MailMessage[] = [];
  let pendingFailure: Error | null = null;
  let closeCount = 0;

  return {
    sent,
    failNext: (error = new Error("smtp refused the message")) => {
      pendingFailure = error;
    },
    closed: () => closeCount,
    transport: {
      name: "log",
      async send(message) {
        if (pendingFailure) {
          const failure = pendingFailure;
          pendingFailure = null;
          throw failure;
        }
        sent.push(message);
      },
      async close() {
        closeCount += 1;
      },
    },
  };
}
