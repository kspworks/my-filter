import { convertSetCookieToCookie } from "better-auth/test";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "~/app/api/trpc/[trpc]/route";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { newId } from "~/server/db/id";
import * as schema from "~/server/db/schema";

/**
 * Everything else calls the router through `createCaller`, which skips the
 * adapter entirely. This drives the real route handler with real `Request`
 * objects, so it is the only coverage of `fetchRequestHandler`, batching, the
 * HTTP status mapping and the `errorFormatter`'s wire shape.
 */

const ENDPOINT = "http://localhost:3000/api/trpc";

let cookie: Headers;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
});

beforeEach(async () => {
  await db.delete(schema.session);
  await db.delete(schema.account);
  await db.delete(schema.verification);
  await db.delete(schema.user);
  await db.delete(schema.consumables);
  await db.delete(schema.systems);

  const { headers } = await auth.api.signUpEmail({
    body: {
      name: "Tester",
      email: "tester@example.com",
      password: "correct-horse-battery",
    },
    returnHeaders: true,
  });
  cookie = convertSetCookieToCookie(headers);
});

function query(path: string, init: { input?: unknown; auth?: boolean } = {}) {
  const url = new URL(`${ENDPOINT}/${path}`);
  if (init.input !== undefined) {
    url.searchParams.set("input", JSON.stringify(init.input));
  }
  return GET(
    new Request(url, {
      headers: init.auth === false ? new Headers() : cookie,
    }),
  );
}

describe("queries over HTTP", () => {
  it("answers a signed-in request", async () => {
    const response = await query("systems.list");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      result: { data: [] },
    });
  });

  it("round-trips input through the query string", async () => {
    const response = await query("consumables.list", {
      input: { unassignedOnly: true },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ result: { data: [] } });
  });

  it("answers a batch in one request", async () => {
    const url = new URL(`${ENDPOINT}/systems.list,systems.presets`);
    url.searchParams.set("batch", "1");

    const response = await GET(new Request(url, { headers: cookie }));
    const body = (await response.json()) as unknown[];

    expect(response.status).toBe(200);
    expect(body).toHaveLength(2);
  });
});

describe("mutations over HTTP", () => {
  it("writes through POST", async () => {
    const response = await POST(
      new Request(`${ENDPOINT}/systems.create`, {
        method: "POST",
        headers: new Headers([...cookie, ["content-type", "application/json"]]),
        body: JSON.stringify({
          manufacturer: "Aquafilter",
          model: "RO-6",
          installedOn: "2026-01-10",
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      result: { data: { manufacturer: string } };
    };
    expect(body.result.data.manufacturer).toBe("Aquafilter");
  });
});

describe("errors over HTTP", () => {
  it("maps an anonymous request to 401", async () => {
    const response = await query("systems.list", { auth: false });
    const body = (await response.json()) as {
      error: { data: { code: string } };
    };

    expect(response.status).toBe(401);
    expect(body.error.data.code).toBe("UNAUTHORIZED");
  });

  it("flattens a validation failure onto `data.zodError`", async () => {
    // Hyphens are outside cuid2's alphabet, so this fails `zId` rather than
    // reaching the database. (A bare word like "nope" would pass it.)
    const response = await query("systems.byId", {
      input: { id: "not-a-cuid" },
    });
    const body = (await response.json()) as {
      error: { data: { code: string; zodError: { fieldErrors: unknown } } };
    };

    expect(response.status).toBe(400);
    expect(body.error.data.code).toBe("BAD_REQUEST");
    // `useErrorToast` branches on this being present, so its shape is load-bearing.
    expect(body.error.data.zodError).toMatchObject({
      fieldErrors: { id: expect.any(Array) },
    });
  });

  it("leaves `zodError` null on a non-validation failure", async () => {
    const created = await POST(
      new Request(`${ENDPOINT}/systems.create`, {
        method: "POST",
        headers: new Headers([...cookie, ["content-type", "application/json"]]),
        body: JSON.stringify({
          manufacturer: "Aquafilter",
          model: "RO-6",
          installedOn: "2026-01-10",
        }),
      }),
    );
    const { result } = (await created.json()) as {
      result: { data: { id: string } };
    };
    await db.delete(schema.systems);

    const response = await query("systems.byId", {
      input: { id: result.data.id },
    });
    const body = (await response.json()) as {
      error: { data: { code: string; zodError: null } };
    };

    expect(response.status).toBe(404);
    expect(body.error.data.zodError).toBeNull();
  });

  it("translates the error through the request's locale cookie", async () => {
    const url = new URL(`${ENDPOINT}/systems.byId`);
    // Well-formed but absent, so the failure comes from the resolver and is
    // raised through `ctx.t` rather than from Zod.
    url.searchParams.set("input", JSON.stringify({ id: newId() }));

    const headers = new Headers(cookie);
    headers.set("cookie", `${headers.get("cookie")}; locale=uk`);
    const response = await GET(new Request(url, { headers }));
    const body = (await response.json()) as { error: { message: string } };

    expect(response.status).toBe(404);
    expect(body.error.message).toMatch(/[\u0400-\u04ff]/);
  });
});
