import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppTranslator } from "~/i18n/translator";
import { DEMO_EMAIL } from "~/lib/demo";
import {
  renderPasswordReset,
  sendPasswordResetEmail,
} from "~/server/mail/password-reset";
import { saveUserLocale } from "~/server/settings/user-settings";
import { createUser, makeTestDb, type TestDb } from "~/test-utils/db";

const transport = vi.hoisted(() => ({
  name: "log" as const,
  send: vi.fn(),
  close: vi.fn(),
}));
vi.mock("~/server/mail", () => ({
  createMailTransport: async () => transport,
}));

const URL = "https://example.com/reset?a=1&b=2";

describe("renderPasswordReset", () => {
  it("carries the link in both the text and the HTML", async () => {
    const mail = renderPasswordReset(
      "alice@example.com",
      URL,
      await createAppTranslator("en"),
    );

    expect(mail.to).toBe("alice@example.com");
    expect(mail.subject).toBe("Reset your My Filter password");
    expect(mail.text).toContain(URL);
    // Escaped, or the second query parameter would not survive the markup.
    expect(mail.html).toContain("a=1&amp;b=2");
  });

  it("is written in the reader's language", async () => {
    const mail = renderPasswordReset(
      "alice@example.com",
      URL,
      await createAppTranslator("uk"),
    );

    expect(mail.subject).toContain("Скидання пароля");
  });
});

describe("sendPasswordResetEmail", () => {
  let db: TestDb;
  let close: () => void;

  beforeEach(async () => {
    ({ db, close } = await makeTestDb());
    transport.send.mockReset();
    transport.close.mockReset();
  });

  afterEach(() => close());

  it("writes in the language on the account and closes the transport", async () => {
    const id = await createUser(db, "olena");
    await saveUserLocale(db, id, "uk");

    await sendPasswordResetEmail(db, { id, email: "olena@example.com" }, URL);

    expect(transport.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "olena@example.com",
        subject: expect.stringContaining("Скидання пароля"),
      }),
    );
    expect(transport.close).toHaveBeenCalled();
  });

  it("closes the transport even when sending fails", async () => {
    const id = await createUser(db, "alice");
    transport.send.mockRejectedValue(new Error("SMTP down"));

    await expect(
      sendPasswordResetEmail(db, { id, email: "alice@example.com" }, URL),
    ).rejects.toThrow("SMTP down");
    expect(transport.close).toHaveBeenCalled();
  });

  it("sends nothing for the demo account", async () => {
    const id = await createUser(db, "demo", { email: DEMO_EMAIL });

    await sendPasswordResetEmail(db, { id, email: DEMO_EMAIL }, URL);

    expect(transport.send).not.toHaveBeenCalled();
  });
});
