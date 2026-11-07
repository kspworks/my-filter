import { describe, expect, it } from "vitest";
import { createAppTranslator } from "~/i18n/translator";
import { renderPasswordReset } from "~/server/mail/password-reset";

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
