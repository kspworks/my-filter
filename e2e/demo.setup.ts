import { expect, test as setup } from "@playwright/test";
import { DEMO_EMAIL } from "~/lib/demo";

/** Signs in as the account `pnpm db:seed` creates, for `pnpm screenshots`. */
setup("sign in as the demo account", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(DEMO_EMAIL);
  await page.getByLabel("Password").fill("demo-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL("/");
  await page.context().storageState({ path: "e2e/.auth/demo.json" });
});
