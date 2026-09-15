import { describe, expect, it } from "vitest";
import { describeTarget } from "~/server/db/target";

describe("describeTarget", () => {
  it("reads the name out of a local file path", () => {
    expect(describeTarget("file:./data/my-filter.db")).toEqual({
      name: "my-filter",
      url: "file:./data/my-filter.db",
      remote: false,
    });
  });

  it("treats :memory: as local", () => {
    expect(describeTarget(":memory:")).toMatchObject({
      name: "memory",
      remote: false,
    });
  });

  it("reads the name out of a Turso hostname", () => {
    expect(describeTarget("libsql://my-filter-kspworks.turso.io")).toEqual({
      name: "my-filter-kspworks",
      url: "libsql://my-filter-kspworks.turso.io",
      remote: true,
    });
  });

  it("never echoes an auth token back", () => {
    const { url } = describeTarget(
      "libsql://my-filter.turso.io?authToken=super-secret",
    );
    expect(url).toBe("libsql://my-filter.turso.io");
    expect(url).not.toContain("super-secret");
  });

  it("never echoes credentials in userinfo back", () => {
    const { url } = describeTarget("libsql://user:hunter2@my-filter.turso.io");
    expect(url).toBe("libsql://my-filter.turso.io");
    expect(url).not.toContain("hunter2");
  });

  it("errs towards remote when the URL cannot be parsed", () => {
    expect(describeTarget("not a url at all")).toEqual({
      name: "database",
      url: "(unparseable URL)",
      remote: true,
    });
  });
});
