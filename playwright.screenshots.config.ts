import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

/**
 * `pnpm screenshots`: the README images in docs/screenshots/.
 *
 * The same production build as the browser tests, but over the demo account
 * `pnpm db:seed` creates, because that is what the README says they show. Its
 * own port and never an existing server: the regular suite's server has no demo
 * data, and `DATABASE_URL` is set here so the seed cannot touch a real database.
 */

const PORT = 3200;
const baseURL = `http://127.0.0.1:${PORT}`;
const STORAGE_STATE = "e2e/.auth/demo.json";

export default defineConfig({
  ...base,
  retries: 0,
  reporter: [["list"]],
  use: { ...base.use, baseURL },
  webServer: {
    command: "pnpm test:e2e:db && pnpm db:seed && pnpm build && pnpm start",
    url: baseURL,
    timeout: 240_000,
    reuseExistingServer: false,
    stdout: "pipe",
    env: {
      PORT: String(PORT),
      DATABASE_URL: "file:./.e2e/e2e.db",
      BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-e2e-secret",
      BETTER_AUTH_URL: baseURL,
      MAIL_TRANSPORT: "log",
      INVITE_ONLY: "false",
    },
  },
  projects: [
    // Once rather than per test: sign-in is rate-limited in a production build.
    { name: "demo", testMatch: /demo\.setup\.ts$/ },
    {
      name: "desktop",
      testMatch: /screenshots\.spec\.ts$/,
      dependencies: ["demo"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 2,
        storageState: STORAGE_STATE,
      },
    },
    {
      name: "mobile",
      testMatch: /screenshots\.spec\.ts$/,
      dependencies: ["demo"],
      use: { ...devices["Pixel 7"], storageState: STORAGE_STATE },
    },
  ],
});
