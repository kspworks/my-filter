import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "~/components/auth/login-form";
import {
  screen,
  setupApp,
  type TestApp,
  userEvent,
  waitFor,
} from "~/test-utils/render";
import { routerMock } from "~/test-utils/stubs/next-navigation";

// better-auth's client talks over the network, so this is the one place mocking
// is the right call. The error *codes* asserted here are pinned against the
// real library in `src/server/auth.test.ts`.
const signIn = vi.hoisted(() => ({ email: vi.fn() }));
vi.mock("~/lib/auth-client", () => ({ signIn }));

let app: TestApp;

beforeEach(async () => {
  app = await setupApp();
  signIn.email.mockReset();
});

afterEach(() => app.close());

const user = () => userEvent.setup();

async function submit(
  email = "tester@example.com",
  password = "correct-horse",
) {
  const actor = user();
  await actor.type(screen.getByLabelText("Email"), email);
  await actor.type(screen.getByLabelText("Password"), password);
  await actor.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("a successful sign-in", () => {
  it("clears cached data and moves to the dashboard", async () => {
    signIn.email.mockResolvedValue({ error: null });
    const clear = vi.spyOn(app.queryClient, "clear");
    app.render(<LoginForm />);

    await submit();

    expect(signIn.email).toHaveBeenCalledWith({
      email: "tester@example.com",
      password: "correct-horse",
    });
    // The previous user's data must not survive the switch.
    await waitFor(() => expect(clear).toHaveBeenCalled());
    expect(routerMock.push).toHaveBeenCalledWith("/");
    expect(routerMock.refresh).toHaveBeenCalled();
  });
});

describe("a rejected sign-in", () => {
  it("translates a code better-auth understands", async () => {
    signIn.email.mockResolvedValue({
      error: { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email" },
    });
    app.render(<LoginForm />);

    await submit();

    // The library's own English message is deliberately discarded.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Wrong email or password.",
    );
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("falls back to a generic message for a code it does not know", async () => {
    signIn.email.mockResolvedValue({
      error: { code: "SOMETHING_NEW", message: "Teapot" },
    });
    app.render(<LoginForm />);

    await submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not sign in.",
    );
  });

  it("lets the user try again", async () => {
    signIn.email.mockResolvedValue({ error: { code: "SOMETHING_NEW" } });
    app.render(<LoginForm />);
    await submit();
    await screen.findByRole("alert");

    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });
});

describe("the form itself", () => {
  it("points at registration", async () => {
    app.render(<LoginForm />);

    expect(screen.getByRole("link", { name: "Create one" })).toHaveAttribute(
      "href",
      "/register",
    );
  });
});

describe("the way to register", () => {
  it("is offered while registration is open", async () => {
    app.render(<LoginForm />);

    expect(screen.getByRole("link", { name: "Create one" })).toHaveAttribute(
      "href",
      "/register",
    );
  });

  it("is not offered while registration is by invite only", async () => {
    app.render(<LoginForm registrationOpen={false} />);

    expect(
      screen.queryByRole("link", { name: "Create one" }),
    ).not.toBeInTheDocument();
  });
});
