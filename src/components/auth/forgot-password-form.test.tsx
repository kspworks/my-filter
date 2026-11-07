import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ForgotPasswordForm } from "~/components/auth/forgot-password-form";
import { screen, setupApp, type TestApp, userEvent } from "~/test-utils/render";

const requestPasswordReset = vi.hoisted(() => vi.fn());
vi.mock("~/lib/auth-client", () => ({ requestPasswordReset }));

let app: TestApp;

beforeEach(async () => {
  app = await setupApp();
  requestPasswordReset.mockReset().mockResolvedValue({ error: null });
});

afterEach(() => app.close());

it("says the same thing whether or not the request succeeded", async () => {
  const user = userEvent.setup();
  requestPasswordReset.mockResolvedValue({ error: { code: "ANYTHING" } });
  app.render(<ForgotPasswordForm />);

  await user.type(screen.getByLabelText("Email"), "someone@example.com");
  await user.click(screen.getByRole("button", { name: "Send reset link" }));

  expect(await screen.findByRole("status")).toHaveTextContent(
    "If «someone@example.com» has an account",
  );
  expect(requestPasswordReset).toHaveBeenCalledWith({
    email: "someone@example.com",
    redirectTo: "/reset-password",
  });
});

describe("the way back", () => {
  it("links to sign-in", () => {
    app.render(<ForgotPasswordForm />);

    expect(
      screen.getByRole("link", { name: "Back to sign in" }),
    ).toHaveAttribute("href", "/login");
  });
});
