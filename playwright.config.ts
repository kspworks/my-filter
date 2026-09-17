import { defineConfig, devices } from "@playwright/test";

/**
 * E2E is the only layer that sees the parts Vitest structurally cannot: the
 * async Server Components, the two layout redirects, the locale Server Action,
 * Radix overlays driven by real pointer events, and code that has been through
 * the React Compiler. So it runs against a production build, not `next dev`.
 */

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

/**
 * A second server with `INVITE_ONLY` on, so both sides of the switch are
 * exercised against a real build. It reuses the first server's build rather
 * than making its own — Playwright starts web servers one after another, so the
 * build exists by the time this one's `pnpm start` runs — and so it is left out
 * of `E2E_DEV` runs, where there is no build to start.
 */
const INVITE_ONLY_PORT = PORT + 1;
export const INVITE_ONLY_URL = `http://127.0.0.1:${INVITE_ONLY_PORT}`;
const inviteOnly = !process.env.E2E_DEV;

/** Shared with `e2e/invites.spec.ts`, which reads and seeds it directly. */
export const INVITE_ONLY_DB = "file:./.e2e/invite-only.db";

/** Shared with `e2e/notifications.spec.ts`, which drives the cron endpoint. */
export const E2E_CRON_SECRET = "e2e-cron-secret-e2e-cron-secret";

export default defineConfig({
  testDir: "./e2e",
  // One SQLite file behind the server, so specs share state and must not race.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html"]] : [["list"]],
  use: { baseURL, trace: "on-first-retry" },
  webServer: [
    {
      // The database is rebuilt here, not in a global setup: Playwright starts
      // the server first, and `next build` opens the database while collecting
      // page data.
      command: process.env.E2E_DEV
        ? "pnpm test:e2e:db && pnpm dev"
        : "pnpm test:e2e:db && pnpm build && pnpm start",
      url: baseURL,
      timeout: 240_000,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      env: {
        PORT: String(PORT),
        DATABASE_URL: "file:./.e2e/e2e.db",
        BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-e2e-secret",
        BETTER_AUTH_URL: baseURL,
        // The digest endpoint is gated on this and refuses everyone without it,
        // so the spec needs it to reach anything past the 401.
        CRON_SECRET: E2E_CRON_SECRET,
        MAIL_TRANSPORT: "log",
        // Said out loud, not left to the default: Next loads `.env`, and a local
        // `INVITE_ONLY="true"` would otherwise close sign-up for every spec here.
        INVITE_ONLY: "false",
      },
    },
    ...(inviteOnly
      ? [
          {
            command: "pnpm start",
            url: INVITE_ONLY_URL,
            timeout: 60_000,
            reuseExistingServer: !process.env.CI,
            stdout: "pipe" as const,
            env: {
              PORT: String(INVITE_ONLY_PORT),
              DATABASE_URL: INVITE_ONLY_DB,
              BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-e2e-secret",
              BETTER_AUTH_URL: INVITE_ONLY_URL,
              MAIL_TRANSPORT: "log",
              INVITE_ONLY: "true",
            },
          },
        ]
      : []),
  ],
  projects: [
    // Registration is the fixture: it signs a user up through the real form,
    // which is both the setup other specs need and a journey worth testing.
    { name: "setup", testMatch: /auth\.setup\.ts$/ },
    {
      name: "anonymous",
      testMatch: /anonymous\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      testIgnore: /(anonymous|invites|mobile)\.spec\.ts$/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
    },
    // Registers its own account, so it needs neither `setup` nor its state.
    {
      name: "mobile",
      testMatch: /mobile\.spec\.ts$/,
      use: { ...devices["Pixel 7"] },
    },
    ...(inviteOnly
      ? [
          {
            name: "invite-only",
            testMatch: /invites\.spec\.ts$/,
            use: { ...devices["Desktop Chrome"], baseURL: INVITE_ONLY_URL },
          },
        ]
      : []),
  ],
});
