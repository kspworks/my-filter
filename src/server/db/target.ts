/**
 * What `DATABASE_URL` is actually pointing at, for scripts that need to say so
 * out loud before doing something irreversible.
 *
 * `NODE_ENV` is useless here: a maintenance script run from a laptop against
 * Turso is `"development"` by every measure Node can see. The URL is the only
 * honest signal, and per the README it is the one thing that changes between
 * environments — so `remote` is this repo's stand-in for "production".
 */

export type Target = {
  /** Short name of the database, used in the banner and in backup filenames. */
  name: string;
  /** The URL with any credentials removed — safe to print and to write into a file. */
  url: string;
  /** Not a local file: deleting from this is somebody's real data. */
  remote: boolean;
};

const FALLBACK_NAME = "database";

/** `file:./data/my-filter.db` → `my-filter`. */
function nameFromPath(path: string): string {
  const base = path.split("/").pop() ?? "";
  const stem = base.replace(/\.[^.]+$/, "");
  return stem.length > 0 ? stem : FALLBACK_NAME;
}

/** `libsql://my-filter-kspworks.turso.io` → `my-filter-kspworks`. */
function nameFromHost(host: string): string {
  const label = host.split(".")[0] ?? "";
  return label.length > 0 ? label : FALLBACK_NAME;
}

export function describeTarget(url: string): Target {
  if (url === ":memory:") {
    return { name: "memory", url, remote: false };
  }

  if (url.startsWith("file:")) {
    const path = url.slice("file:".length).split("?")[0] ?? "";
    return { name: nameFromPath(path), url, remote: false };
  }

  // A token can travel either as `?authToken=` or as userinfo. Neither belongs
  // in a log line or a dump header, so parse and rebuild rather than trim.
  try {
    const parsed = new URL(url);
    return {
      name: nameFromHost(parsed.hostname),
      url: `${parsed.protocol}//${parsed.host}${parsed.pathname}`.replace(
        /\/$/,
        "",
      ),
      remote: true,
    };
  } catch {
    // Unparseable, so we cannot prove it is local and cannot prove it carries
    // no secret. Treat it as remote and print nothing back.
    return { name: FALLBACK_NAME, url: "(unparseable URL)", remote: true };
  }
}
