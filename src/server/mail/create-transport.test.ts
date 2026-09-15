import { describe, expect, it } from "vitest";
import {
  createTransport,
  type MailEnvironment,
  readMailConfig,
} from "~/server/mail/create-transport";

/**
 * The line between "no mail configured, carry on" and "mail configured wrong,
 * stop". Getting it in the wrong place either breaks every build that has no
 * secrets, or hides a typo until the first cron run.
 */

describe("readMailConfig", () => {
  it("asks for nothing at all when the transport logs", () => {
    // The case that keeps `next build`, CI and a fresh clone green.
    expect(readMailConfig({ MAIL_TRANSPORT: "log" })).toEqual({
      transport: "log",
    });
  });

  it("names the variable it is missing", () => {
    expect(() =>
      readMailConfig({
        MAIL_TRANSPORT: "gmail",
        GMAIL_APP_PASSWORD: "x".repeat(16),
      }),
    ).toThrow(/GMAIL_USER/);
    expect(() =>
      readMailConfig({
        MAIL_TRANSPORT: "gmail",
        GMAIL_USER: "bot@example.com",
      }),
    ).toThrow(/GMAIL_APP_PASSWORD/);
  });

  it("points at where an App Password comes from", () => {
    // The one piece of setup nobody guesses: it needs 2-Step Verification, and
    // the ordinary account password is rejected by Gmail.
    expect(() => readMailConfig({ MAIL_TRANSPORT: "gmail" })).toThrow(
      /apppasswords/i,
    );
  });

  it("defaults the From to the account, which is all Gmail will honour", () => {
    const base: MailEnvironment = {
      MAIL_TRANSPORT: "gmail",
      GMAIL_USER: "bot@example.com",
      GMAIL_APP_PASSWORD: "abcd efgh ijkl mnop",
    };

    expect(readMailConfig(base)).toEqual({
      transport: "gmail",
      user: "bot@example.com",
      appPassword: "abcd efgh ijkl mnop",
      from: "bot@example.com",
    });
    expect(
      readMailConfig({ ...base, MAIL_FROM: "My Filter <bot@example.com>" }),
    ).toMatchObject({ from: "My Filter <bot@example.com>" });
  });

  it("refuses a transport it has no implementation for", () => {
    expect(() =>
      readMailConfig({ MAIL_TRANSPORT: "carrier-pigeon" as never }),
    ).toThrow(/Unknown MAIL_TRANSPORT/);
  });
});

describe("createTransport", () => {
  it("builds the log transport without loading nodemailer", async () => {
    const transport = await createTransport({ transport: "log" });

    expect(transport.name).toBe("log");
  });

  it("builds a Gmail transport from a complete config", async () => {
    const transport = await createTransport({
      transport: "gmail",
      user: "bot@example.com",
      appPassword: "abcd efgh ijkl mnop",
      from: "bot@example.com",
    });

    expect(transport.name).toBe("gmail");
    expect(transport.close).toBeTypeOf("function");
    await transport.close?.();
  });
});
