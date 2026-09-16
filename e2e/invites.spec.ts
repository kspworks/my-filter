import { createClient } from "@libsql/client/node";
import { createId } from "@paralleldrive/cuid2";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { INVITE_ONLY_DB } from "../playwright.config";

/**
 * Invite-only registration against its own production server, started with
 * `INVITE_ONLY=true` (see `playwright.config.ts`). Every other spec runs against
 * the open-registration server, which is what proves the switch's "off" side
 * leaves the app as it was.
 *
 * What only exists here: the register page as an async Server Component
 * reading `?invite=`, the token surviving the better-auth client's request body
 * into the gate, the layout reading the env to show the Invites link, and the
 * clipboard in a real browser.
 */

test.use({ storageState: { cookies: [], origins: [] } });
// One journey, in order: each step needs the account the one before created.
test.describe.configure({ mode: "serial" });

const PASSWORD = "correct-horse-battery";

/**
 * Nobody can register without an invite, so the first link has to come from
 * outside the app — the same bootstrap problem a fresh invite-only deploy has.
 * A user row with no credentials is enough to own one.
 */
async function seedFounderInvite(): Promise<string> {
  const client = createClient({ url: INVITE_ONLY_DB });
  const founderId = createId();
  const token = createId();
  const nowSeconds = Math.floor(Date.now() / 1000);

  await client.execute({
    sql: "INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
    args: [
      founderId,
      "Founder",
      `founder-${token}@example.com`,
      nowSeconds,
      nowSeconds,
    ],
  });
  await client.execute({
    sql: "INSERT INTO invites (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [createId(), founderId, token, Date.now() + 86_400_000, Date.now()],
  });
  client.close();

  return token;
}

async function register(page: Page, link: string, name: string) {
  await page.goto(link);
  await page.getByLabel("Username").fill(name);
  await page.getByLabel("Email").fill(`${name.toLowerCase()}@example.com`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
}

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { page: await context.newPage(), close: () => context.close() };
}

let aliceLink: string;

test("keeps registration closed without an invite", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("link", { name: "Create one" })).toHaveCount(0);

  await page.goto("/register");
  await expect(page.getByText("Registration is by invitation")).toBeVisible();
  await expect(page.getByLabel("Password")).toHaveCount(0);

  await page.goto("/register?invite=made-up-token");
  await expect(
    page.getByText(/can only be created with an invite/),
  ).toBeVisible();
});

test("lets an invited person join, and invite someone else", async ({
  page,
  context,
}) => {
  const founderToken = await seedFounderInvite();

  await register(page, `/register?invite=${founderToken}`, "Alice");
  await expect(page).toHaveURL("/");

  await page.getByRole("link", { name: "Invites" }).click();
  await expect(page).toHaveURL("/invites");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Create invite link" }).click();
  await expect(page.getByText("Invite link created and copied.")).toBeVisible();

  const field = page.getByRole("textbox", { name: "Invite link" });
  aliceLink = await field.inputValue();
  expect(aliceLink).toMatch(/\/register\?invite=/);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    aliceLink,
  );
});

test("accepts the link once, and names who sent it", async ({ browser }) => {
  const bob = await freshPage(browser);
  await bob.page.goto(aliceLink);
  await expect(
    bob.page.getByText("«Alice» invited you to My Filter."),
  ).toBeVisible();
  await register(bob.page, aliceLink, "Bob");
  await expect(bob.page).toHaveURL("/");
  await bob.close();

  const carol = await freshPage(browser);
  await carol.page.goto(aliceLink);
  await expect(carol.page.getByText(/already been used/)).toBeVisible();
  await carol.close();
});

test("shows the sender who joined", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("alice@example.com");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/invites");
  await expect(page.getByText("Joined as «Bob»")).toBeVisible();
});
