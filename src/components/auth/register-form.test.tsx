import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RegisterForm } from "~/components/auth/register-form";
import {
  screen,
  setupApp,
  type TestApp,
  userEvent,
  waitFor,
} from "~/test-utils/render";
import { routerMock } from "~/test-utils/stubs/next-navigation";
import { setLocale } from "~/test-utils/stubs/set-locale";

const signUp = vi.hoisted(() => ({ email: vi.fn() }));
vi.mock("~/lib/auth-client", () => ({ signUp }));

let app: TestApp;

beforeEach(async () => {
  app = await setupApp();
  signUp.email.mockReset();
  vi.mocked(setLocale).mockClear();
});

afterEach(() => app.close());

async function fill({
  name = "Tester",
  email = "tester@example.com",
  password = "correct-horse",
} = {}) {
  const actor = userEvent.setup();
  await actor.type(screen.getByLabelText("Username"), name);
  await actor.type(screen.getByLabelText("Email"), email);
  await actor.type(screen.getByLabelText("Password"), password);
  await actor.click(screen.getByRole("button", { name: "Create account" }));
}

describe("client-side guard", () => {
  it("refuses a short password without asking the server", async () => {
    app.render(<RegisterForm />);

    await fill({ password: "short" });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Password must be at least 8 characters.",
    );
    // Worth pinning: the round trip is skipped entirely.
    expect(signUp.email).not.toHaveBeenCalled();
  });
});

describe("a successful registration", () => {
  it("trims the name, clears the cache and moves on", async () => {
    signUp.email.mockResolvedValue({ error: null });
    const clear = vi.spyOn(app.queryClient, "clear");
    app.render(<RegisterForm />);

    await fill({ name: "  Tester  " });

    expect(signUp.email).toHaveBeenCalledWith({
      name: "Tester",
      email: "tester@example.com",
      password: "correct-horse",
    });
    await waitFor(() => expect(clear).toHaveBeenCalled());
    expect(routerMock.push).toHaveBeenCalledWith("/");
  });

  it("records the language the account was created in", async () => {
    signUp.email.mockResolvedValue({ error: null });
    app.render(<RegisterForm />);

    await fill();

    // Otherwise a new account has no language on record at all, and the daily
    // digest falls back to English until they use the language switcher.
    await waitFor(() => expect(setLocale).toHaveBeenCalledWith("en"));
  });
});

describe("a rejected registration", () => {
  it("records no language, because there is no account to record it for", async () => {
    signUp.email.mockResolvedValue({ error: { code: "USER_ALREADY_EXISTS" } });
    app.render(<RegisterForm />);

    await fill();

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(setLocale).not.toHaveBeenCalled();
  });

  it("translates a known code", async () => {
    signUp.email.mockResolvedValue({ error: { code: "PASSWORD_TOO_LONG" } });
    app.render(<RegisterForm />);

    await fill();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That password is too long.",
    );
  });

  it("falls back for a code it does not know", async () => {
    signUp.email.mockResolvedValue({ error: { code: "TEAPOT" } });
    app.render(<RegisterForm />);

    await fill();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not create the account.",
    );
  });
});

describe("the form itself", () => {
  it("tells the user how long a password has to be", async () => {
    app.render(<RegisterForm />);

    expect(screen.getByText("At least 8 characters.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
  });
});

describe("joining through an invite", () => {
  it("says who sent it and hands the token to the server", async () => {
    signUp.email.mockResolvedValue({ error: null });
    app.render(
      <RegisterForm
        invite={{ token: "the-invite-token", invitedBy: "Alice" }}
      />,
    );

    expect(
      screen.getByText("«Alice» invited you to My Filter."),
    ).toBeInTheDocument();

    await fill();

    expect(signUp.email).toHaveBeenCalledWith({
      name: "Tester",
      email: "tester@example.com",
      password: "correct-horse",
      inviteToken: "the-invite-token",
    });
  });

  it("explains a link that stopped working after the page loaded", async () => {
    signUp.email.mockResolvedValue({ error: { code: "INVITE_REQUIRED" } });
    app.render(
      <RegisterForm
        invite={{ token: "the-invite-token", invitedBy: "Alice" }}
      />,
    );

    await fill();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This invite link is no longer valid.",
    );
  });
});
