import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsView } from "~/components/settings-view";
import {
  screen,
  setupApp,
  type TestApp,
  userEvent,
  waitFor,
  within,
} from "~/test-utils/render";
import { routerMock } from "~/test-utils/stubs/next-navigation";

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
  routerMock.push.mockReset();
  routerMock.refresh.mockReset();
  for (const mock of Object.values(authClient)) {
    mock.mockReset().mockResolvedValue({ error: null });
  }
});

afterEach(() => app.close());

describe("profile", () => {
  it("saves a new name and refreshes the nav that shows it", async () => {
    const user = userEvent.setup();
    app.render(<SettingsView />);

    const name = await screen.findByLabelText("Name");
    await user.clear(name);
    await user.type(name, "  Renamed  ");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Name updated.")).toBeInTheDocument();
    expect(authClient.updateUser).toHaveBeenCalledWith({ name: "Renamed" });
    expect(routerMock.refresh).toHaveBeenCalled();
  });

  it("explains a refusal instead of claiming it saved", async () => {
    const user = userEvent.setup();
    authClient.updateUser.mockResolvedValue({
      error: { code: "DEMO_ACCOUNT" },
    });
    app.render(<SettingsView />);

    await user.type(await screen.findByLabelText("Name"), "x");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText("The demo account cannot be changed."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Name updated.")).not.toBeInTheDocument();
  });

  it("shows the email it signs in with, read-only", async () => {
    app.render(<SettingsView />);

    const email = await screen.findByLabelText("Email");
    expect(email).toHaveValue("tester@example.com");
    expect(email).toHaveAttribute("readonly");
  });
});

describe("your data", () => {
  it("downloads everything the account owns as JSON", async () => {
    const user = userEvent.setup();
    await app.caller.systems.create({
      manufacturer: "Aquafilter",
      model: "RO-6",
      installedOn: "2026-01-10",
    });
    let saved: Blob | undefined;
    const createObjectURL = vi.fn((blob: Blob) => {
      saved = blob;
      return "blob:export";
    });
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    app.render(<SettingsView />);
    await user.click(
      await screen.findByRole("button", { name: "Export data" }),
    );

    await waitFor(() => expect(click).toHaveBeenCalled());
    const data = JSON.parse((await saved?.text()) ?? "{}");
    expect(data.account).toEqual({
      name: "tester",
      email: "tester@example.com",
    });
    expect(data.systems).toMatchObject([{ manufacturer: "Aquafilter" }]);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:export");

    click.mockRestore();
    vi.unstubAllGlobals();
  });
});

describe("signing out", () => {
  it("clears the session and goes to sign-in", async () => {
    const user = userEvent.setup();
    app.render(<SettingsView />);

    await user.click(await screen.findByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith("/login"));
    expect(authClient.signOut).toHaveBeenCalled();
  });
});

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

  it("deletes with the password and leaves for sign-in", async () => {
    const user = userEvent.setup();
    app.render(<SettingsView />);

    await user.click(
      await screen.findByRole("button", { name: "Delete account" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByLabelText("Enter your password to confirm"),
      "my-password",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Delete account" }),
    );

    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith("/login"));
    expect(authClient.deleteUser).toHaveBeenCalledWith({
      password: "my-password",
    });
  });

  it("stays put and explains a wrong password", async () => {
    const user = userEvent.setup();
    authClient.deleteUser.mockResolvedValue({
      error: { code: "INVALID_PASSWORD" },
    });
    app.render(<SettingsView />);

    await user.click(
      await screen.findByRole("button", { name: "Delete account" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByLabelText("Enter your password to confirm"),
      "wrong",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Delete account" }),
    );

    expect(
      await within(dialog).findByText("That password is not correct."),
    ).toBeInTheDocument();
    expect(routerMock.push).not.toHaveBeenCalledWith("/login");
  });

  it("closes without deleting when cancelled", async () => {
    const user = userEvent.setup();
    app.render(<SettingsView />);

    await user.click(
      await screen.findByRole("button", { name: "Delete account" }),
    );
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Cancel",
      }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
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
