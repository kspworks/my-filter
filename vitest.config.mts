import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = fileURLToPath(new URL("./src", import.meta.url));

/**
 * The file extension picks the environment: `*.test.ts` runs in Node (pure
 * logic, routers, the database), `*.test.tsx` runs in jsdom (anything that
 * renders). The rule is self-enforcing — you cannot write a render test
 * without JSX — and it keeps tests colocated with the code they cover.
 */
export default defineConfig({
  resolve: { alias: { "~": src } },
  test: {
    // Root-only: `coverage` and `reporters` cannot be set per project.
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**"],
      exclude: [
        "src/components/ui/**", // thin shadcn/Radix wrappers
        "src/app/**", // async Server Components — E2E covers these
        "src/test-utils/**",
        "src/types/**",
        "src/**/*.test.*",
      ],
      // Set from a real run rather than guessed, and deliberately just under
      // it: the point is to fail when coverage drops, not to hit a round
      // number. What is left uncovered is mostly the Next-runtime wiring
      // (`i18n/request.ts`, `i18n/set-locale.ts`, `lib/trpc/client.tsx`,
      // `server/mail/index.ts`) and the Radix menu paths in
      // `consumable-row.tsx` and `language-switcher.tsx` — all of it covered
      // by the Playwright suite instead.
      thresholds: {
        statements: 89,
        branches: 87,
        functions: 79,
        lines: 89,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts"],
          // Only the files that import the real `~/server/auth` need these, but
          // setting them project-wide keeps `src/env.ts` quiet everywhere.
          env: {
            DATABASE_URL: ":memory:",
            BETTER_AUTH_SECRET: "vitest-secret-vitest-secret-vitest-secret",
            BETTER_AUTH_URL: "http://localhost:3000",
            // Not strictly needed — `src/env.ts` defaults it — but it means a
            // test that accidentally reaches `~/server/mail` gets the log
            // transport rather than trying to open a socket.
            MAIL_TRANSPORT: "log",
          },
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["./src/test-utils/setup-dom.ts"],
          // Deliberately no `env`: a component test that reaches for
          // `~/server/db` should fail loudly in `src/env.ts`, not quietly work.
        },
        resolve: {
          alias: [
            // jsdom resolves with browser conditions, which point
            // `@libsql/client` at a web build that cannot open `:memory:`.
            // Drizzle's driver imports the bare specifier, so redirect it.
            { find: /^@libsql\/client$/, replacement: "@libsql/client/node" },
            {
              find: /^next\/navigation$/,
              replacement: `${src}/test-utils/stubs/next-navigation.ts`,
            },
            {
              find: /^~\/i18n\/set-locale$/,
              replacement: `${src}/test-utils/stubs/set-locale.ts`,
            },
            // Prefix match, so the catch-all has to come last.
            { find: "~", replacement: src },
          ],
        },
      },
    ],
  },
});
