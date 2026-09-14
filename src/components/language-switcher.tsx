"use client";

import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { isLocale, LOCALES } from "~/i18n/locale";
import { setLocale } from "~/i18n/set-locale";

export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations("settings.language");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleChange(value: string) {
    if (!isLocale(value) || value === locale) return;

    startTransition(async () => {
      await setLocale(value);
      // Messages are resolved on the server from the cookie, so the tree has
      // to be re-rendered rather than just re-styled.
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label={t("label")}
          disabled={pending}
        >
          <Languages aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={locale} onValueChange={handleChange}>
          {LOCALES.map((value) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {t(value)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
