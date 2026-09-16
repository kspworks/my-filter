import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InviteRequiredCard } from "~/components/auth/invite-required-card";
import { screen, setupApp, type TestApp } from "~/test-utils/render";

let app: TestApp;

beforeEach(async () => {
  app = await setupApp();
});

afterEach(() => app.close());

describe("the closed register page", () => {
  it.each([
    ["missing", /can only be created with an invite link/],
    ["used", /already been used/],
    ["revoked", /was revoked/],
    ["expired", /has expired/],
  ] as const)("explains a %s link", async (reason, text) => {
    app.render(<InviteRequiredCard reason={reason} />);

    expect(
      screen.getByText("Registration is by invitation"),
    ).toBeInTheDocument();
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
  });
});
