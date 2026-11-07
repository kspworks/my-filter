import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResetPasswordForm } from "~/components/auth/reset-password-form";
import { screen, setupApp, type TestApp, userEvent } from "~/test-utils/render";
import { routerMock } from "~/test-utils/stubs/next-navigation";

const resetPassword = vi.hoisted(() => vi.fn());
vi.mock("~/lib/auth-client", () => ({ resetPassword }));

let app: TestApp;

beforeEach(async () => {
  app = await setupApp();
  resetPassword.mockReset().mockResolvedValue({ error: null });
});

afterEach(() => app.close());

describe("with a token", () => {
  it("saves the password and returns to sign-in", async () => {
    const user = userEvent.setup();
    app.render(<ResetPasswordForm token="abc" />);

    await user.type(screen.getByLabelText("New password"), "a-new-password");
    await user.click(screen.getByRole("button", { name: "Save new password" }));

    expect(resetPassword).toHaveBeenCalledWith({
      newPassword: "a-new-password",
      token: "abc",
    });
    expect(routerMock.push).toHaveBeenCalledWith("/login");
  });

  it("explains a token that has gone stale", async () => {
    const user = userEvent.setup();
    resetPassword.mockResolvedValue({ error: { code: "INVALID_TOKEN" } });
    app.render(<ResetPasswordForm token="abc" />);

    await user.type(screen.getByLabelText("New password"), "a-new-password");
    await user.click(screen.getByRole("button", { name: "Save new password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "invalid or has expired",
    );
  });
});

describe("without a token", () => {
  it("offers a new link instead of a form", () => {
    app.render(<ResetPasswordForm token={null} />);

    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Request a new link" }),
    ).toHaveAttribute("href", "/forgot-password");
  });
});
