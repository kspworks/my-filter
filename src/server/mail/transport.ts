/**
 * What the notification job knows about sending mail, and no more.
 *
 * Gmail is what this ships with, but nothing above this line names it: adding
 * Resend, Postmark or a plain SMTP host is one file implementing `MailTransport`
 * and one arm in `create-transport`, with no change to the digest, the renderer
 * or their tests.
 */

export type MailMessage = {
  to: string;
  subject: string;
  /** Always sent alongside the HTML — a first-class alternative, not a stub. */
  text: string;
  html: string;
};

export const MAIL_TRANSPORTS = ["gmail", "log"] as const;

export type MailTransportName = (typeof MAIL_TRANSPORTS)[number];

export type MailTransport = {
  /** For the run summary and the log line; never shown to a reader. */
  readonly name: MailTransportName;
  send(message: MailMessage): Promise<void>;
  /**
   * Optional because only a transport holding a socket has anything to release.
   * Callers always await it: an idle pooled SMTP connection keeps a serverless
   * function billable right up to its timeout.
   */
  close?(): Promise<void>;
};
