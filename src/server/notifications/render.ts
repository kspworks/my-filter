import type { Locale } from "~/i18n/locale";
import type { AppTranslator } from "~/i18n/translator";
import {
  type DuePhraseKey,
  duePhraseMessage,
  formatDate,
} from "~/lib/format-date";
import { NOTIFICATION_KINDS, type NotificationKind } from "~/lib/notifications";
import type { MailMessage } from "~/server/mail/transport";
import type { Notice, UserDigest } from "~/server/notifications/select";

/**
 * One digest, in the reader's language. Pure: it takes a translator rather than
 * reaching for a request-scoped one, the same reason `assertOwnsSystem` takes
 * `ctx.t`.
 *
 * The keys are looked up through maps rather than template literals, so adding
 * a notification kind without a message is a type error here instead of a raw
 * key in somebody's inbox.
 */

const SUBJECT_KEY = {
  due: "email.digest.subject.due",
  warning: "email.digest.subject.warning",
} as const satisfies Record<NotificationKind, string>;

const HEADING_KEY = {
  due: "email.digest.heading.due",
  warning: "email.digest.heading.warning",
} as const satisfies Record<NotificationKind, string>;

const DUE_PHRASE_KEY = {
  today: "duePhrase.today",
  overdue: "duePhrase.overdue",
  upcoming: "duePhrase.upcoming",
} as const satisfies Record<DuePhraseKey, string>;

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Cartridge and system names are free-form user input, and next-intl
 * interpolates them verbatim — right for the text part, an injection in the
 * HTML one. Escaping the finished line covers both placeholders at once.
 */
function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) => ESCAPES[character] ?? character,
  );
}

function renderLine(notice: Notice, t: AppTranslator, locale: Locale): string {
  const phrase = duePhraseMessage(notice.daysUntilDue);
  const values = {
    name: notice.name,
    // "due today" / "3 days overdue" / "in 5 days", already declined.
    due: t(DUE_PHRASE_KEY[phrase.key], { count: phrase.count }),
    date: formatDate(notice.dueOn, locale),
  };

  // Two whole messages rather than one with an optional clause: Ukrainian needs
  // its own preposition for "in «{system}»", not a fragment glued on.
  return notice.system
    ? t("email.digest.itemWithSystem", { ...values, system: notice.system })
    : t("email.digest.item", values);
}

export function renderDigest(
  digest: UserDigest,
  t: AppTranslator,
  appUrl: string,
): MailMessage {
  const sections = NOTIFICATION_KINDS.map((kind) => ({
    kind,
    // `planDigests` already ordered these; partitioning keeps that order.
    notices: digest.notices.filter((notice) => notice.kind === kind),
  })).filter((section) => section.notices.length > 0);

  const leading = sections[0];
  if (!leading) {
    throw new Error("renderDigest was given a digest with no notices");
  }

  // The subject leads with whatever is most urgent and counts only that group;
  // the body carries the rest. A subject trying to say both numbers reads like
  // a report, and the urgent number is the one worth seeing on a lock screen.
  const subject = t(SUBJECT_KEY[leading.kind], {
    count: leading.notices.length,
  });

  const lines = sections.map((section) => ({
    heading: t(HEADING_KEY[section.kind]),
    items: section.notices.map((notice) =>
      renderLine(notice, t, digest.locale),
    ),
  }));

  const intro = t("email.digest.intro");
  const openApp = t("email.digest.openApp");
  const footer = t("email.digest.footer");

  const text = [
    intro,
    "",
    ...lines.flatMap(({ heading, items }) => [
      heading,
      ...items.map((item) => `- ${item}`),
      "",
    ]),
    `${openApp}: ${appUrl}`,
    "",
    footer,
  ].join("\n");

  // Inline styles only, no <style> block and no images: every mail client
  // strips at least one of those, and this has to read the same in all of them.
  const html = [
    `<div lang="${digest.locale}" style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.5;color:#18181b">`,
    `<p>${escapeHtml(intro)}</p>`,
    ...lines.map(
      ({ heading, items }) =>
        `<h2 style="font-size:16px;margin:24px 0 8px">${escapeHtml(heading)}</h2>` +
        `<ul style="margin:0;padding-left:20px">${items
          .map((item) => `<li style="margin:4px 0">${escapeHtml(item)}</li>`)
          .join("")}</ul>`,
    ),
    `<p style="margin-top:24px"><a href="${escapeHtml(appUrl)}" style="color:#2563eb">${escapeHtml(openApp)}</a></p>`,
    `<p style="margin-top:24px;font-size:13px;color:#71717a">${escapeHtml(footer)}</p>`,
    "</div>",
  ].join("");

  return { to: digest.email, subject, text, html };
}
