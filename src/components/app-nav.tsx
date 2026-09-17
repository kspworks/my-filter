"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Droplets, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "~/components/language-switcher";
import { ThemeToggle } from "~/components/theme-toggle";
import { Button } from "~/components/ui/button";
import { signOut } from "~/lib/auth-client";
import { cn } from "~/lib/utils";

const LINKS = [
  { href: "/", key: "dashboard" },
  { href: "/systems", key: "systems" },
  { href: "/consumables", key: "consumables" },
] as const;

/** Only while registration is invite-only; otherwise there is nothing to share. */
const INVITES_LINK = { href: "/invites", key: "invites" } as const;

export function AppNav({
  userName,
  invitesEnabled = false,
}: {
  userName: string;
  invitesEnabled?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTranslations("nav");
  const tApp = useTranslations("app");

  async function handleSignOut() {
    await signOut();
    // Never leave this user's data sitting in memory for whoever signs in next.
    queryClient.clear();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-border bg-card">
      {/* Below `md` the links drop to a second row that scrolls sideways rather
          than hiding behind a menu, so they stay one tap away. */}
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 sm:px-6 sm:py-3 md:flex-nowrap">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Droplets className="size-5 text-brand" aria-hidden />
          {tApp("name")}
        </Link>

        <nav className="order-last -mx-4 flex w-[calc(100%+2rem)] items-center gap-1 overflow-x-auto px-4 sm:-mx-6 sm:w-[calc(100%+3rem)] sm:px-6 md:order-none md:mx-0 md:w-auto md:overflow-visible md:px-0">
          {(invitesEnabled ? [...LINKS, INVITES_LINK] : LINKS).map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(link.key)}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <span className="mr-2 hidden max-w-48 truncate text-sm text-muted-foreground sm:inline">
            {userName}
          </span>
          <LanguageSwitcher />
          <ThemeToggle />
          <Button
            variant="ghost"
            size="sm"
            className="max-sm:px-2"
            onClick={handleSignOut}
          >
            <LogOut aria-hidden />
            {/* Still the button's accessible name when only the icon shows. */}
            <span className="sr-only sm:not-sr-only">{t("signOut")}</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
