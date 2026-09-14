import { convertSetCookieToCookie } from "better-auth/test";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { isCuid } from "~/server/db/id";
import * as schema from "~/server/db/schema";
import { createTRPCContext } from "~/server/trpc/context";

/**
 * The one file that drives the *real* better-auth instance rather than a caller
 * with a hand-built context.
 *
 * `src/server/db/schema/auth.ts` is a hand-copy of better-auth's own table
 * definitions, and the migrations are generated from that copy. So an upgrade
 * that adds a column or renames a field breaks production silently — the
 * library writes a column SQLite does not have. A parallel `betterAuth()`
 * instance would only test the library against itself and catch none of it.
 *
 * `DATABASE_URL` is `:memory:` for this project (see `vitest.config.mts`), so
 * the singleton `db` is a throwaway; it just has to be migrated first.
 */

const CREDENTIALS = {
  name: "Tester",
  email: "tester@example.com",
  password: "correct-horse-battery",
};

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
});

beforeEach(async () => {
  // One process-wide database, so clear it rather than rebuilding it.
  await db.delete(schema.session);
  await db.delete(schema.account);
  await db.delete(schema.verification);
  await db.delete(schema.user);
});

async function signUp(overrides: Partial<typeof CREDENTIALS> = {}) {
  return auth.api.signUpEmail({
    body: { ...CREDENTIALS, ...overrides },
    returnHeaders: true,
  });
}

describe("sign-up", () => {
  it("creates the user and its credential account", async () => {
    await signUp();

    const [user] = await db.select().from(schema.user);
    const [account] = await db.select().from(schema.account);

    expect(user?.email).toBe(CREDENTIALS.email);
    expect(user?.name).toBe("Tester");
    // `advanced.database.generateId` makes better-auth's ids match the app's.
    expect(isCuid(user?.id ?? "")).toBe(true);
    expect(account?.userId).toBe(user?.id);
    expect(account?.providerId).toBe("credential");
    expect(account?.password).toBeTruthy();
    expect(account?.password).not.toContain(CREDENTIALS.password);
  });

  it("enforces the eight-character minimum", async () => {
    // The register form checks this client-side too; this is the server half.
    await expect(signUp({ password: "short" })).rejects.toMatchObject({
      body: { code: "PASSWORD_TOO_SHORT" },
    });
  });

  it("refuses a duplicate email", async () => {
    await signUp();

    // NOTE: better-auth 1.7.4 emits `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`,
    // but `KNOWN_CODES` in `~/lib/auth-errors.ts` lists `USER_ALREADY_EXISTS`
    // — so the register form falls back to the generic "signUpFailed" message
    // and `auth.errors.USER_ALREADY_EXISTS` is never shown. Pinned as-is: this
    // asserts what the library does, and will fail if that ever changes.
    await expect(signUp({ name: "Impostor" })).rejects.toMatchObject({
      body: { code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" },
    });
  });

  it("refuses a malformed email", async () => {
    // Same mismatch: `KNOWN_CODES` expects `INVALID_EMAIL`. In practice the
    // form's `type="email"` input stops this before it reaches the server.
    await expect(signUp({ email: "not-an-email" })).rejects.toMatchObject({
      body: { code: "VALIDATION_ERROR" },
    });
  });
});

describe("sign-in", () => {
  it("rejects the wrong password with the code the UI translates", async () => {
    await signUp();

    await expect(
      auth.api.signInEmail({
        body: { email: CREDENTIALS.email, password: "wrong-password-entirely" },
      }),
    ).rejects.toMatchObject({ body: { code: "INVALID_EMAIL_OR_PASSWORD" } });
  });

  it("rejects an unknown account with the same code, revealing nothing", async () => {
    await expect(
      auth.api.signInEmail({
        body: {
          email: "nobody@example.com",
          password: "correct-horse-battery",
        },
      }),
    ).rejects.toMatchObject({ body: { code: "INVALID_EMAIL_OR_PASSWORD" } });
  });

  it("issues a session cookie that resolves back to the user", async () => {
    await signUp();
    const { headers } = await auth.api.signInEmail({
      body: { email: CREDENTIALS.email, password: CREDENTIALS.password },
      returnHeaders: true,
    });

    const session = await auth.api.getSession({
      headers: convertSetCookieToCookie(headers),
    });

    expect(session?.user.email).toBe(CREDENTIALS.email);
  });
});

describe("getSession", () => {
  it("returns nothing for an absent or junk cookie", async () => {
    await signUp();

    expect(await auth.api.getSession({ headers: new Headers() })).toBeNull();
    expect(
      await auth.api.getSession({
        headers: new Headers({ cookie: "better-auth.session_token=forged" }),
      }),
    ).toBeNull();
  });

  it("stops accepting the cookie after sign-out", async () => {
    const { headers } = await signUp();
    const cookie = convertSetCookieToCookie(headers);
    expect(await auth.api.getSession({ headers: cookie })).not.toBeNull();

    await auth.api.signOut({ headers: cookie });

    expect(await auth.api.getSession({ headers: cookie })).toBeNull();
  });
});

describe("the tRPC context built from a real request", () => {
  it("carries the signed-in user through", async () => {
    const { headers } = await signUp();

    const ctx = await createTRPCContext({
      headers: convertSetCookieToCookie(headers),
    });

    expect(ctx.user?.email).toBe(CREDENTIALS.email);
    expect(isCuid(ctx.user?.id ?? "")).toBe(true);
  });

  it("is anonymous without a cookie, and speaks English by default", async () => {
    const ctx = await createTRPCContext({ headers: new Headers() });

    expect(ctx.user).toBeNull();
    expect(ctx.locale).toBe("en");
    expect(ctx.t("errors.systemNotFound")).toMatch(/not found/i);
  });

  it("reads the language off the request's own cookie header", async () => {
    const ctx = await createTRPCContext({
      headers: new Headers({ cookie: "locale=uk" }),
    });

    expect(ctx.locale).toBe("uk");
    // Procedures raise errors through `ctx.t`, so this is what a Ukrainian
    // user would actually be shown.
    expect(ctx.t("errors.systemNotFound")).toMatch(/[Ѐ-ӿ]/);
  });
});
