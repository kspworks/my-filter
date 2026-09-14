import type { Locale } from "~/i18n/locale";

/**
 * Static import per locale rather than a computed path: a bundler can only
 * follow `import()` it can read, and an aliased template literal is not that.
 * Adding a language means adding a line here.
 */
const LOADERS = {
  en: () => import("../messages/en.json"),
  uk: () => import("../messages/uk.json"),
} satisfies Record<Locale, () => Promise<{ default: unknown }>>;

export type Messages = Awaited<ReturnType<(typeof LOADERS)["en"]>>["default"];

export async function loadMessages(locale: Locale): Promise<Messages> {
  return (await LOADERS[locale]()).default as Messages;
}
