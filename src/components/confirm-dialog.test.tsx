import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { screen, setupApp, type TestApp, userEvent } from "~/test-utils/render";

let app: TestApp;

beforeEach(async () => {
  app = await setupApp();
});

afterEach(() => app.close());

function renderDialog(props: { pending?: boolean; confirmLabel?: string }) {
  const onConfirm = vi.fn();
  app.render(
    <ConfirmDialog
      open
      onOpenChange={vi.fn()}
      title="Delete «Sediment PP»?"
      description="This cannot be undone."
      onConfirm={onConfirm}
      {...props}
    />,
  );
  return onConfirm;
}

describe("confirming", () => {
  it("defaults the action to Delete and calls back", async () => {
    const onConfirm = renderDialog({});

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Delete" }));

    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("cannot be confirmed again while the action is running", () => {
    renderDialog({ pending: true, confirmLabel: "Remove" });

    const confirm = screen.getByRole("button", { name: "Remove" });
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAttribute("aria-busy", "true");
  });
});
