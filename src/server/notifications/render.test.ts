import { describe, expect, it } from "vitest";
import { createAppTranslator } from "~/i18n/translator";
import { renderDigest } from "~/server/notifications/render";
import type { Notice, UserDigest } from "~/server/notifications/select";

/**
 * Rendered with the real translator and the real catalogues, so a message that
 * was renamed, mistyped or left untranslated fails here rather than arriving in
 * somebody's inbox as a key path.
 */

const APP_URL = "https://my-filter.example.com";

function notice(overrides: Partial<Notice> = {}): Notice {
  return {
    consumableId: "c1",
    name: "Sediment PP",
    system: "Aquafilter RO-6",
    kind: "due",
    dueOn: "2026-09-14",
    daysUntilDue: 0,
    ...overrides,
  };
}

async function render(
  notices: Notice[],
  { locale = "en" as UserDigest["locale"] } = {},
) {
  return renderDigest(
    { userId: "u1", email: "alice@example.com", locale, notices },
    await createAppTranslator(locale),
    APP_URL,
  );
}

describe("the subject", () => {
  it("leads with what is urgent, and counts only that group", async () => {
    const message = await render([
      notice({ consumableId: "a" }),
      notice({ consumableId: "b", dueOn: "2026-09-10", daysUntilDue: -4 }),
      notice({ consumableId: "c", kind: "warning", daysUntilDue: 9 }),
    ]);

    // Three cartridges in the email, but "2 need replacing" is the number worth
    // seeing on a lock screen. The warning is in the body.
    expect(message.subject).toBe("2 cartridges need replacing");
  });

  it("uses the warning wording when nothing is due yet", async () => {
    const message = await render([
      notice({ kind: "warning", daysUntilDue: 12 }),
    ]);

    expect(message.subject).toBe("1 cartridge is due for replacement soon");
  });

  it("refuses an empty digest rather than sending a blank email", async () => {
    await expect(render([])).rejects.toThrow(/no notices/i);
  });
});

describe("the body", () => {
  it("puts replace-now before coming-up, in both parts", async () => {
    const message = await render([
      notice({ consumableId: "a" }),
      notice({ consumableId: "b", kind: "warning", daysUntilDue: 5 }),
    ]);

    expect(message.text.indexOf("Replace now")).toBeLessThan(
      message.text.indexOf("Coming up"),
    );
    expect(message.html.indexOf("Replace now")).toBeLessThan(
      message.html.indexOf("Coming up"),
    );
  });

  it("names the system when there is one, and omits it otherwise", async () => {
    const withSystem = await render([notice()]);
    const without = await render([notice({ system: null })]);

    expect(withSystem.text).toContain(
      "«Sediment PP» in «Aquafilter RO-6» — due today, scheduled for 14 Sep 2026",
    );
    expect(without.text).toContain(
      "«Sediment PP» — due today, scheduled for 14 Sep 2026",
    );
    expect(without.text).not.toContain("Aquafilter");
  });

  it("declines the due phrase rather than printing a bare number", async () => {
    const message = await render([
      notice({ consumableId: "a", daysUntilDue: -1, dueOn: "2026-09-13" }),
      notice({ consumableId: "b", kind: "warning", daysUntilDue: 1 }),
    ]);

    expect(message.text).toContain("1 day overdue");
    expect(message.text).toContain("in 1 day");
  });

  it("links back to the app in both parts", async () => {
    const message = await render([notice()]);

    expect(message.text).toContain(APP_URL);
    expect(message.html).toContain(`href="${APP_URL}"`);
  });

  it("addresses the message to the person it is about", async () => {
    expect((await render([notice()])).to).toBe("alice@example.com");
  });
});

describe("Ukrainian", () => {
  it("renders the whole message in Ukrainian, dates included", async () => {
    const message = await render(
      [
        notice({ consumableId: "a", name: "Осадовий PP" }),
        notice({
          consumableId: "b",
          name: "Вугільний блок",
          kind: "warning",
          daysUntilDue: 5,
          dueOn: "2026-09-19",
        }),
      ],
      { locale: "uk" },
    );

    expect(message.subject).toBe("1 картридж потребує заміни");
    expect(message.text).toContain("Замініть зараз");
    expect(message.text).toContain("Незабаром");
    expect(message.text).toContain("через 5 днів");
    // A silent fall back to the English catalogue would show up as Latin text.
    expect(message.text).toMatch(/[Ѐ-ӿ]/);
    expect(message.text).not.toContain("Replace now");
    expect(message.html).toContain('lang="uk"');
  });

  it("declines the subject count", async () => {
    const many = await render(
      Array.from({ length: 5 }, (_, index) =>
        notice({ consumableId: `c${index}` }),
      ),
      { locale: "uk" },
    );

    expect(many.subject).toBe("5 картриджів потребують заміни");
  });
});

describe("user data in the body", () => {
  it("escapes a cartridge name in the HTML part but not the text one", async () => {
    // `consumables.name` is free-form input. next-intl interpolates it
    // verbatim, which is right for one part and an injection in the other.
    const message = await render([
      notice({ name: 'Sediment <b>PP</b> & "co"' }),
    ]);

    expect(message.text).toContain('Sediment <b>PP</b> & "co"');
    expect(message.html).toContain("Sediment &lt;b&gt;PP&lt;/b&gt; &amp;");
    expect(message.html).not.toContain("<b>PP</b>");
  });

  it("leaves no message key unrendered", async () => {
    const message = await render([
      notice({ consumableId: "a" }),
      notice({ consumableId: "b", kind: "warning", daysUntilDue: 3 }),
    ]);

    // next-intl returns the key path when a message is missing, so a renamed or
    // mistyped key shows up as "email.digest.…" in the body rather than failing.
    for (const part of [message.subject, message.text, message.html]) {
      expect(part).not.toContain("email.digest.");
      expect(part).not.toContain("duePhrase.");
    }
  });
});
