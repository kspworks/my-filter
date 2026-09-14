import { Droplets } from "lucide-react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { LanguageSwitcher } from "~/components/language-switcher";
import { ThemeToggle } from "~/components/theme-toggle";
import { auth } from "~/server/auth";

export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/");

  const t = await getTranslations("app");

  return (
    <main className="relative flex flex-1 items-center justify-center px-4 py-16">
      {/* There is no nav on these pages, so the preference controls live here —
          otherwise sign-in is stuck on whatever the defaults are. */}
      <div className="absolute top-4 right-4 flex items-center gap-1">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <Droplets className="size-6 text-primary" aria-hidden />
          <span className="text-lg font-semibold tracking-tight">
            {t("name")}
          </span>
        </div>
        {children}
      </div>
    </main>
  );
}
