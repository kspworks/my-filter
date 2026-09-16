import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type RenderResult, render } from "@testing-library/react";
import {
  createTRPCClient,
  type TRPCLink,
  unstable_localLink,
} from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { ThemeProvider } from "~/components/theme-provider";
import { Toaster } from "~/components/ui/sonner";
import type { Locale } from "~/i18n/locale";
import { loadMessages } from "~/i18n/messages";
// The very same module the components call `useTRPC()` from: the React context
// object is minted at module scope, so a second instance would not connect.
import { TRPCProvider } from "~/lib/trpc/client";
import type { AppRouter } from "~/server/trpc/routers/_app";
import { appRouter } from "~/server/trpc/routers/_app";
import { callerFor, makeContext } from "~/test-utils/caller";
import { createUser, makeTestDb, type TestDb } from "~/test-utils/db";

/**
 * Renders a component against the real stack. `unstable_localLink` dispatches
 * straight into `appRouter` in-process, so a component's `useQuery` runs the
 * real resolver, the real Zod parse and real Drizzle SQL against a real
 * migrated SQLite database — and the payload is JSON round-tripped on the way
 * back, exactly as it would be over HTTP.
 *
 * The point is that there are no fixtures to drift: an upgrade that breaks any
 * link in that chain fails a component test.
 */

const MESSAGES = {
  en: await loadMessages("en"),
  uk: await loadMessages("uk"),
};

export type TestApp = {
  db: TestDb;
  userId: string;
  queryClient: QueryClient;
  /** Seed fixtures through this — ids must be real cuid2s to satisfy `zId`. */
  caller: Awaited<ReturnType<typeof callerFor>>;
  render: (ui: ReactNode) => RenderResult;
  /**
   * Parks every mutation sent after this call until the returned `release` is
   * called, so a test can see a button while its request is still running.
   * The request itself still goes through the real router once released.
   */
  holdMutations: () => () => void;
  close: () => void;
};

export async function setupApp({
  locale = "en" as Locale,
  inviteOnly = false,
} = {}): Promise<TestApp> {
  const { db, close } = await makeTestDb();
  const userId = await createUser(db, "tester");
  const ctx = await makeContext(db, userId, locale, { inviteOnly });

  // The local link resolves on a microtask, so without a gate no render ever
  // happens while a mutation is pending.
  let gate: Promise<void> | undefined;
  const holdLink: TRPCLink<AppRouter> =
    () =>
    ({ op, next }) =>
      observable((observer) => {
        let unsubscribe: (() => void) | undefined;
        let cancelled = false;
        const held = op.type === "mutation" ? gate : undefined;
        void Promise.resolve(held).then(() => {
          if (cancelled) return;
          unsubscribe = next(op).subscribe(observer).unsubscribe;
        });
        return () => {
          cancelled = true;
          unsubscribe?.();
        };
      });

  const trpcClient = createTRPCClient<AppRouter>({
    links: [
      holdLink,
      unstable_localLink({
        router: appRouter,
        createContext: async () => ctx,
      }),
    ],
  });

  // Not the production defaults: `retry: 1` makes error-path tests slow and
  // `staleTime: 30_000` makes invalidation assertions read stale. Those two
  // lines of config are exercised for real by the E2E suite instead.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });

  return {
    db,
    userId,
    queryClient,
    caller: await callerFor(db, userId, locale, { inviteOnly }),
    close,
    holdMutations: () => {
      let release!: () => void;
      gate = new Promise((resolve) => {
        release = resolve;
      });
      return () => {
        gate = undefined;
        release();
      };
    },
    render: (ui: ReactNode) =>
      render(
        <ThemeProvider>
          <NextIntlClientProvider
            locale={locale}
            messages={MESSAGES[locale]}
            timeZone="UTC"
            // A missing or broken message must fail the test rather than
            // quietly rendering its key.
            onError={(error) => {
              throw error;
            }}
          >
            <QueryClientProvider client={queryClient}>
              <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
                {ui}
                <Toaster />
              </TRPCProvider>
            </QueryClientProvider>
          </NextIntlClientProvider>
        </ThemeProvider>,
      ),
  };
}

export { screen, waitFor, within } from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
