import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { ThemeProvider } from "~/components/theme-provider";
import { Toaster } from "~/components/ui/sonner";
import { Providers } from "~/lib/trpc/client";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: t("app.name"),
    description: t("app.description"),
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();

  return (
    // next-themes sets the `dark` class on <html> from a pre-paint script, so
    // the server markup and the first client render differ here by design.
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {/* Both children need the theme: the toggle lives under `Providers`,
            and `Toaster` reads `useTheme()` to match sonner to the palette. */}
        <ThemeProvider>
          <NextIntlClientProvider>
            <Providers>{children}</Providers>
            <Toaster position="bottom-right" />
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
