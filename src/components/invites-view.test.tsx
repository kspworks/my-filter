import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InvitesView } from "~/components/invites-view";
import { DEMO_EMAIL } from "~/lib/demo";
import { MAX_OPEN_INVITES } from "~/lib/invites";
import { user } from "~/server/db/schema/auth";
import {
  screen,
  setupApp,
  type TestApp,
  userEvent,
  waitFor,
  within,
} from "~/test-utils/render";

let app: TestApp;

beforeEach(async () => {
  app = await setupApp({ inviteOnly: true });
});

afterEach(() => app.close());

describe("creating a link", () => {
  it("starts empty, then shows the new link and copies it", async () => {
    // `userEvent.setup()` installs its own clipboard, which is what lets the
    // copy be read back here.
    const actor = userEvent.setup();
    app.render(<InvitesView />);

    expect(await screen.findByText("No invites yet")).toBeInTheDocument();
    expect(
      screen.getByText("You can create 5 more links."),
    ).toBeInTheDocument();

    await actor.click(
      screen.getByRole("button", { name: "Create invite link" }),
    );

    expect(
      await screen.findByText("Invite link created and copied."),
    ).toBeInTheDocument();
    const [invite] = (await app.caller.invites.list()).invites;
    const link = `${window.location.origin}/register?invite=${invite?.token}`;
    expect(await navigator.clipboard.readText()).toBe(link);
    expect(screen.getByRole("textbox", { name: "Invite link" })).toHaveValue(
      link,
    );
    expect(screen.getByText("Waiting")).toBeInTheDocument();
    expect(
      screen.getByText("You can create 4 more links."),
    ).toBeInTheDocument();
  });

  it("shows the button busy while the link is being created", async () => {
    const actor = userEvent.setup();
    app.render(<InvitesView />);
    const create = await screen.findByRole("button", {
      name: "Create invite link",
    });

    const release = app.holdMutations();
    await actor.click(create);

    await waitFor(() => expect(create).toHaveAttribute("aria-busy", "true"));
    expect(create).toBeDisabled();
    expect(create).toHaveTextContent("Creating link…");

    release();
    expect(
      await screen.findByText("Invite link created and copied."),
    ).toBeInTheDocument();
  });

  it("stops offering new links at the cap", async () => {
    for (let i = 0; i < MAX_OPEN_INVITES; i++) {
      await app.caller.invites.create();
    }
    app.render(<InvitesView />);

    expect(
      await screen.findByText(/No links left for now/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create invite link" }),
    ).toBeDisabled();
  });

  it("explains that the demo account cannot invite", async () => {
    await app.db
      .update(user)
      .set({ email: DEMO_EMAIL })
      .where(eq(user.id, app.userId));
    app.render(<InvitesView />);

    expect(
      await screen.findByText("The demo account cannot invite people."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create invite link" }),
    ).toBeDisabled();
  });
});

describe("an existing link", () => {
  it("copies again on request", async () => {
    const actor = userEvent.setup();
    const invite = await app.caller.invites.create();
    app.render(<InvitesView />);

    await actor.click(await screen.findByRole("button", { name: "Copy link" }));

    expect(await screen.findByText("Link copied.")).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toContain(invite.token);
  });

  it("can be revoked once confirmed", async () => {
    const actor = userEvent.setup();
    await app.caller.invites.create();
    app.render(<InvitesView />);

    await actor.click(await screen.findByRole("button", { name: "Revoke" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText("Revoke this invite link?"),
    ).toBeInTheDocument();
    await actor.click(within(dialog).getByRole("button", { name: "Revoke" }));

    expect(await screen.findByText("Invite link revoked.")).toBeInTheDocument();
    expect(await screen.findByText("Revoked")).toBeInTheDocument();
    // A closed link has nothing left to copy or revoke.
    expect(
      screen.queryByRole("button", { name: "Copy link" }),
    ).not.toBeInTheDocument();
    expect((await app.caller.invites.list()).openCount).toBe(0);
  });
});
