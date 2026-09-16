import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppNav } from "~/components/app-nav";
import {
  screen,
  setupApp,
  type TestApp,
  userEvent,
  waitFor,
} from "~/test-utils/render";
import { pathnameRef, routerMock } from "~/test-utils/stubs/next-navigation";

const signOut = vi.hoisted(() => vi.fn());
vi.mock("~/lib/auth-client", () => ({ signOut }));

let app: TestApp;

beforeEach(async () => {
  app = await setupApp();
  signOut.mockReset().mockResolvedValue(undefined);
});

afterEach(() => app.close());

describe("the links", () => {
  it("names the signed-in user and points at each section", async () => {
    app.render(<AppNav userName="Tester" />);

    expect(screen.getByText("Tester")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Systems" })).toHaveAttribute(
      "href",
      "/systems",
    );
    expect(screen.getByRole("link", { name: "Consumables" })).toHaveAttribute(
      "href",
      "/consumables",
    );
  });

  it("links to Invites only while registration is by invite", async () => {
    const { unmount } = app.render(<AppNav userName="Tester" />);
    expect(
      screen.queryByRole("link", { name: "Invites" }),
    ).not.toBeInTheDocument();
    unmount();

    app.render(<AppNav userName="Tester" invitesEnabled />);
    expect(screen.getByRole("link", { name: "Invites" })).toHaveAttribute(
      "href",
      "/invites",
    );
  });

  it.each([
    ["/", "Dashboard"],
    ["/systems", "Systems"],
    // A detail page still highlights its section.
    ["/systems/abc", "Systems"],
    ["/consumables", "Consumables"],
  ])("highlights %s as %s", async (pathname, active) => {
    pathnameRef.current = pathname;

    app.render(<AppNav userName="Tester" />);

    expect(screen.getByRole("link", { name: active })).toHaveClass("bg-muted");
  });

  it("matches the dashboard exactly, so it does not stay lit everywhere", async () => {
    pathnameRef.current = "/systems";

    app.render(<AppNav userName="Tester" />);

    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveClass(
      "bg-muted",
    );
  });
});

describe("signing out", () => {
  it("ends the session, empties the cache and returns to the login page", async () => {
    const actor = userEvent.setup();
    const clear = vi.spyOn(app.queryClient, "clear");
    app.render(<AppNav userName="Tester" />);

    await actor.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => expect(signOut).toHaveBeenCalled());
    // Order matters: nothing of this user's may be left for the next one.
    expect(clear).toHaveBeenCalled();
    expect(routerMock.push).toHaveBeenCalledWith("/login");
    expect(routerMock.refresh).toHaveBeenCalled();
  });
});
