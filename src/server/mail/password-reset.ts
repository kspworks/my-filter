import { createAppTranslator } from "~/i18n/translator";
import { DEMO_EMAIL } from "~/lib/demo";
import type { DbOrTransaction } from "~/server/db";
import { createMailTransport } from "~/server/mail";
import type { MailMessage } from "~/server/mail/transport";
import { readUserLocale } from "~/server/settings/user-settings";

type Translate = Awaited<ReturnType<typeof createAppTranslator>>;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Pure, like `renderDigest`: the same inline-styles-only rules apply here. */
export function renderPasswordReset(
  to: string,
  url: string,
  t: Translate,
): MailMessage {
  const intro = t("email.passwordReset.intro");
  const action = t("email.passwordReset.action");
  const footer = t("email.passwordReset.footer");

  return {
    to,
    subject: t("email.passwordReset.subject"),
    text: [intro, "", `${action}: ${url}`, "", footer].join("\n"),
    html: [
      `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.5;color:#18181b">`,
      `<p>${escapeHtml(intro)}</p>`,
      `<p><a href="${escapeHtml(url)}" style="color:#2563eb">${escapeHtml(action)}</a></p>`,
      `<p style="margin-top:24px;font-size:13px;color:#71717a">${escapeHtml(footer)}</p>`,
      "</div>",
    ].join(""),
  };
}

/**
 * Written in the language on the person's account rather than the requesting
 * browser's: someone locked out may well be on a device that is not theirs.
 *
 * The demo account has no mailbox behind it and a published password, so it is
 * skipped silently. The response to the request stays the same as for any other
 * address.
 */
export async function sendPasswordResetEmail(
  db: DbOrTransaction,
  user: { id: string; email: string },
  url: string,
): Promise<void> {
  if (user.email === DEMO_EMAIL) return;

  const t = await createAppTranslator(await readUserLocale(db, user.id));
  const transport = await createMailTransport();
  try {
    await transport.send(renderPasswordReset(user.email, url, t));
  } finally {
    await transport.close?.();
  }
}
