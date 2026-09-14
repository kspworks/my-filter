import type { Locale } from "~/i18n/locale";
import type { Messages } from "~/i18n/messages";

/**
 * Makes `t("…")` key-checked against `en.json` and narrows next-intl's `Locale`
 * to the two we actually ship. `uk.json` is kept structurally identical, so a
 * missing translation is a type error rather than a runtime fallback.
 */
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}
