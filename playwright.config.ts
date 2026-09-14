import { defineConfig, devices } from "@playwright/test";

/**
 * E2E is the only layer that sees the parts Vitest structurally cannot: the
 * async Server Components, the two layout redirects, the locale Server Action,
 * Radix overlays driven by real pointer events, and code that has been through
 * the React Compiler. So it runs against a production build, not `next dev`.
 */

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // One SQLite file behind the server, so specs share state and must not race.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html"]] : [["list"]],
  use: { baseURL, trace: "on-first-retry" },
  webServer: {
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
    },
  },
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
      testIgnore: /anonymous\.spec\.ts$/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
    },
  ],
});
