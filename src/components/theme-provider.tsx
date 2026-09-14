"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Dark is the default: someone opening the app for the first time gets it, and
 * only an explicit choice (stored by next-themes in localStorage) overrides it.
 *
 * `attribute="class"` because `globals.css` declares
 * `@custom-variant dark (&:is(.dark *))` — a class variant, not `data-theme`.
 * The theme is deliberately *not* kept in a cookie: reading one in the root
 * layout would opt the whole app out of prerendering, and next-themes already
 * avoids the flash with a pre-paint inline script.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
