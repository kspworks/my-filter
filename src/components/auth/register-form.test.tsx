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

const signUp = vi.hoisted(() => ({ email: vi.fn() }));
vi.mock("~/lib/auth-client", () => ({ signUp }));

let app: TestApp;

beforeEach(async () => {
  app = await setupApp();
  signUp.email.mockReset();
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
});

describe("a rejected registration", () => {
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
