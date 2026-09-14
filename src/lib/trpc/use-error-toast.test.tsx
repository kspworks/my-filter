import type { TRPCClientErrorLike } from "@trpc/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useErrorToast } from "~/lib/trpc/use-error-toast";
import type { AppRouter } from "~/server/trpc/routers/_app";
import { screen, setupApp, type TestApp, userEvent } from "~/test-utils/render";

/**
 * Every mutation in the app routes its failures through this hook, so which
 * branch fires decides what a user is told when something goes wrong.
 */

type AppError = TRPCClientErrorLike<AppRouter>;

let app: TestApp;

beforeEach(async () => {
  app = await setupApp();
});

afterEach(() => app.close());

function Probe({ error }: { error: unknown }) {
  const onError = useErrorToast();
  return (
    <button type="button" onClick={() => onError(error as AppError)}>
      fail
    </button>
  );
}

async function toastFor(error: unknown) {
  const actor = userEvent.setup();
  app.render(<Probe error={error} />);
  await actor.click(screen.getByRole("button", { name: "fail" }));
}

describe("which message the user sees", () => {
  it("blames the form when the server rejected the input", async () => {
    await toastFor({
      message: "ignored",
      data: { code: "BAD_REQUEST", zodError: { fieldErrors: { name: [] } } },
    });

    expect(
      await screen.findByText(
        "Please check the values in the form and try again.",
      ),
    ).toBeInTheDocument();
  });

  it("tells the user to sign in again when the session has gone", async () => {
    await toastFor({ message: "UNAUTHORIZED", data: { code: "UNAUTHORIZED" } });

    expect(
      await screen.findByText(
        "Your session has expired. Please sign in again.",
      ),
    ).toBeInTheDocument();
  });

  it("stays vague about an internal failure", async () => {
    await toastFor({
      message: "TypeError: cannot read property of undefined",
      data: { code: "INTERNAL_SERVER_ERROR", zodError: null },
    });

    // A stack-trace-shaped message is never worth showing to a person.
    expect(
      await screen.findByText("Something went wrong. Please try again."),
    ).toBeInTheDocument();
  });

  it("falls back to generic when there is no message at all", async () => {
    await toastFor({
      message: "",
      data: { code: "NOT_FOUND", zodError: null },
    });

    expect(
      await screen.findByText("Something went wrong. Please try again."),
    ).toBeInTheDocument();
  });

  it("passes through a message the server already translated", async () => {
    // Routers raise these through `ctx.t`, so they are in the user's language.
    await toastFor({
      message: "System not found",
      data: { code: "NOT_FOUND", zodError: null },
    });

    expect(await screen.findByText("System not found")).toBeInTheDocument();
  });
});
