import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsView } from "~/components/settings-view";
import {
  screen,
  setupApp,
  type TestApp,
  userEvent,
  waitFor,
} from "~/test-utils/render";

const authClient = vi.hoisted(() => ({
  changePassword: vi.fn(),
  deleteUser: vi.fn(),
  signOut: vi.fn(),
  updateUser: vi.fn(),
}));
vi.mock("~/lib/auth-client", () => authClient);

let app: TestApp;

beforeEach(async () => {
  app = await setupApp();
  for (const mock of Object.values(authClient)) {
    mock.mockReset().mockResolvedValue({ error: null });
  }
});

afterEach(() => app.close());

describe("email reminders", () => {
  it("turns off, and the choice is saved", async () => {
    const user = userEvent.setup();
    app.render(<SettingsView />);

    const toggle = await screen.findByRole("checkbox", {
      name: /Email me when cartridges are due/,
    });
    expect(toggle).toBeChecked();
    await user.click(toggle);

    expect(
      await screen.findByText("Email reminders turned off."),
    ).toBeInTheDocument();
    await waitFor(async () => {
      expect((await app.caller.account.settings()).digestEnabled).toBe(false);
    });
    await waitFor(() => expect(toggle).not.toBeChecked());
  });
});

describe("password", () => {
  it("sends both passwords and revokes other sessions", async () => {
    const user = userEvent.setup();
    app.render(<SettingsView />);

    await user.type(
      await screen.findByLabelText("Current password"),
      "oldpass",
    );
    await user.type(screen.getByLabelText("New password"), "brand-new-pass");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByText("Password changed.")).toBeInTheDocument();
    expect(authClient.changePassword).toHaveBeenCalledWith({
      currentPassword: "oldpass",
      newPassword: "brand-new-pass",
      revokeOtherSessions: true,
    });
  });

  it("explains a wrong current password", async () => {
    const user = userEvent.setup();
    authClient.changePassword.mockResolvedValue({
      error: { code: "INVALID_PASSWORD" },
    });
    app.render(<SettingsView />);

    await user.type(await screen.findByLabelText("Current password"), "wrong");
    await user.type(screen.getByLabelText("New password"), "brand-new-pass");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(
      await screen.findByText("That password is not correct."),
    ).toBeInTheDocument();
  });
});

describe("deleting the account", () => {
  it("asks for the password first", async () => {
    const user = userEvent.setup();
    app.render(<SettingsView />);

    await user.click(
      await screen.findByRole("button", { name: "Delete account" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("This cannot be undone.");
    expect(authClient.deleteUser).not.toHaveBeenCalled();
  });
});

describe("when the settings cannot be loaded", () => {
  it("says so", async () => {
    app.failQueries();

    app.render(<SettingsView />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn’t load your data",
    );
  });
});
