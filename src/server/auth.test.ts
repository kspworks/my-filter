import { convertSetCookieToCookie } from "better-auth/test";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_EMAIL } from "~/lib/demo";
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
  await db.delete(schema.consumableReplacements);
  await db.delete(schema.consumables);
  await db.delete(schema.systems);
  await db.delete(schema.session);
  await db.delete(schema.account);
  await db.delete(schema.verification);
  await db.delete(schema.userSettings);
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

describe("recording the language at sign-in", () => {
  async function signIn(headers: Record<string, string> = {}) {
    return auth.api.signInEmail({
      body: { email: CREDENTIALS.email, password: CREDENTIALS.password },
      headers: new Headers(headers),
    });
  }

  async function storedLocale() {
    const [row] = await db.select().from(schema.userSettings);
    return row?.locale;
  }

  it("copies the cookie's choice where a background job can read it", async () => {
    // The locale is per-browser and the digest has no browser. Sign-in is the
    // moment a request carrying the choice is guaranteed to exist.
    await signUp();
    await signIn({ cookie: "theme=dark; locale=uk" });

    expect(await storedLocale()).toBe("uk");
  });

  it("falls back to the browser's stated preference when nothing was chosen", async () => {
    await signUp();
    await signIn({ "accept-language": "uk-UA,uk;q=0.9,en;q=0.5" });

    expect(await storedLocale()).toBe("uk");
  });

  it("lets a choice stand against a browser that disagrees", async () => {
    await signUp();
    await signIn({ cookie: "locale=en" });
    // A guess must never overwrite a choice — somebody who deliberately picked
    // English keeps it when they next sign in on a Ukrainian phone.
    await signIn({ "accept-language": "uk-UA" });

    expect(await storedLocale()).toBe("en");
  });

  it("overwrites an earlier choice with a later one", async () => {
    await signUp();
    await signIn({ cookie: "locale=en" });
    await signIn({ cookie: "locale=uk" });

    expect(await storedLocale()).toBe("uk");
    expect(await db.select().from(schema.userSettings)).toHaveLength(1);
  });
});

/** Through `auth.handler`, because the demo guard only applies to real requests. */
async function post(
  path: string,
  body: Record<string, unknown>,
  cookie?: string,
) {
  return auth.handler(
    new Request(`http://localhost:3000/api/auth${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}

async function signedInAs(overrides: Partial<typeof CREDENTIALS> = {}) {
  const { headers } = await signUp(overrides);
  return (
    convertSetCookieToCookie(new Headers(headers)).get("cookie") ??
    headers.get("set-cookie")?.split(";")[0] ??
    ""
  );
}

describe("account deletion", () => {
  it("erases the user's own data along with the account", async () => {
    const cookie = await signedInAs();
    const [user] = await db.select().from(schema.user);
    await db.insert(schema.systems).values({
      userId: user?.id ?? "",
      manufacturer: "Aquafilter",
      model: "RO-6",
      installedOn: "2026-01-10",
    });

    const response = await post(
      "/delete-user",
      { password: CREDENTIALS.password },
      cookie,
    );

    expect(response.status).toBe(200);
    expect(await db.select().from(schema.user)).toEqual([]);
    expect(await db.select().from(schema.systems)).toEqual([]);
    expect(await db.select().from(schema.account)).toEqual([]);
    expect(await db.select().from(schema.session)).toEqual([]);
  });

  it("refuses the wrong password and keeps everything", async () => {
    const cookie = await signedInAs();

    const response = await post(
      "/delete-user",
      { password: "not-the-password" },
      cookie,
    );

    expect(response.status).toBe(400);
    expect(await db.select().from(schema.user)).toHaveLength(1);
  });
});

describe("the demo account", () => {
  it.each([
    ["/change-password", { currentPassword: "x", newPassword: "yyyyyyyy" }],
    ["/update-user", { name: "Mallory" }],
    ["/delete-user", { password: CREDENTIALS.password }],
  ])("cannot be changed through %s", async (path, body) => {
    const cookie = await signedInAs({ email: DEMO_EMAIL });

    const response = await post(path, body, cookie);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "DEMO_ACCOUNT" });
    expect(await db.select().from(schema.user)).toMatchObject([
      { name: CREDENTIALS.name },
    ]);
  });

  it("leaves everybody else alone", async () => {
    const cookie = await signedInAs();

    const response = await post("/update-user", { name: "Renamed" }, cookie);

    expect(response.status).toBe(200);
    expect(await db.select().from(schema.user)).toMatchObject([
      { name: "Renamed" },
    ]);
  });
});

describe("password reset", () => {
  it("answers the same for an address with no account", async () => {
    await signUp();

    const known = await post("/request-password-reset", {
      email: CREDENTIALS.email,
      redirectTo: "/reset-password",
    });
    const unknown = await post("/request-password-reset", {
      email: "nobody@example.com",
      redirectTo: "/reset-password",
    });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(await known.json()).toEqual(await unknown.json());
  });

  it("changes the password and signs out every session", async () => {
    await signUp();
    await post("/request-password-reset", {
      email: CREDENTIALS.email,
      redirectTo: "/reset-password",
    });
    const [stored] = await db.select().from(schema.verification);
    const token = stored?.identifier.replace("reset-password:", "") ?? "";

    const response = await post("/reset-password", {
      newPassword: "a-brand-new-password",
      token,
    });

    expect(response.status).toBe(200);
    expect(await db.select().from(schema.session)).toEqual([]);
    const signIn = await post("/sign-in/email", {
      email: CREDENTIALS.email,
      password: "a-brand-new-password",
    });
    expect(signIn.status).toBe(200);
  });

  it("refuses a token it never issued", async () => {
    const response = await post("/reset-password", {
      newPassword: "a-brand-new-password",
      token: "made-up",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_TOKEN" });
  });
});
