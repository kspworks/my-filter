import "dotenv/config";

import { createInterface } from "node:readline/promises";
import { env } from "~/env";
import { db } from "~/server/db";
import {
  deleteUserEverywhere,
  findUserFootprint,
  type UserFootprint,
} from "~/server/db/delete-user";
import { describeTarget, type Target } from "~/server/db/target";

/**
 * Deletes one account and everything belonging to it. There is no undo.
 *
 *   pnpm db:delete-user alex@example.com            # dry run — prints, deletes nothing
 *   pnpm db:delete-user alex@example.com --confirm  # actually deletes
 *   pnpm db:delete-user <user id> --confirm --yes   # and skips the prompt
 *
 * Printing without `--confirm` is the default because the interesting mistake is
 * not "I meant a different flag", it is "I meant a different account" — and the
 * footprint this prints is what catches that.
 *
 * A remote `DATABASE_URL` means production (`NODE_ENV` cannot tell: a script run
 * from a laptop against Turso is "development" by every measure Node has), so
 * there `--confirm` alone is not enough — the account's email has to be typed
 * back. `--yes` is the way through for anything non-interactive, and has to be
 * asked for explicitly rather than happening by default when there is no TTY.
 */

const USAGE =
  "Usage: pnpm db:delete-user <user id or email> [--confirm] [--yes]";

type Args = { target: string; confirm: boolean; yes: boolean };

function parseArgs(argv: string[]): Args {
  const flags = argv.filter((arg) => arg.startsWith("--"));
  const positional = argv.filter((arg) => !arg.startsWith("--"));

  const unknown = flags.filter(
    (flag) => !["--confirm", "--yes"].includes(flag),
  );
  if (unknown.length > 0) {
    throw new Error(`Unknown option ${unknown[0]}.\n${USAGE}`);
  }
  if (positional.length !== 1 || !positional[0]) {
    throw new Error(`Name exactly one account.\n${USAGE}`);
  }

  return {
    target: positional[0],
    confirm: flags.includes("--confirm"),
    yes: flags.includes("--yes"),
  };
}

function report(target: Target, footprint: UserFootprint) {
  console.log(`Database: ${target.name} (${target.url})`);
  if (target.remote) {
    console.log("          ⚠  REMOTE DATABASE — this is somebody's real data.");
  }
  console.log(
    `Account:  ${footprint.user.email} — ${footprint.user.name} (${footprint.user.id})`,
  );
  console.log(`          created ${footprint.user.createdAt.toISOString()}`);
  console.log("");
  console.log("Will delete:");
  for (const [table, rows] of Object.entries(footprint.counts)) {
    console.log(`  ${table.padEnd(16)}${rows}`);
  }
  console.log(`  ${"the account".padEnd(16)}1`);
  console.log("");
}

/** The last gate on a remote database: type the email back, exactly. */
async function confirmByTyping(email: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const typed = await rl.question(
      "Type the account's email address to confirm deletion: ",
    );
    return typed.trim() === email;
  } finally {
    rl.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = describeTarget(env.DATABASE_URL ?? "");

  const footprint = await findUserFootprint(db, args.target);
  if (!footprint) {
    console.error(`No account matches "${args.target}" in ${target.name}.`);
    process.exit(1);
  }

  report(target, footprint);

  if (!args.confirm) {
    console.log("Dry run — nothing was deleted. Re-run with --confirm.");
    console.log("Take a backup first: pnpm db:backup");
    return;
  }

  if (target.remote && !args.yes) {
    if (!process.stdin.isTTY) {
      console.error(
        "Refusing to delete from a remote database without confirmation.",
      );
      console.error(
        "Re-run in a terminal, or pass --yes if you are scripting.",
      );
      process.exit(1);
    }
    if (!(await confirmByTyping(footprint.user.email))) {
      console.error("That is not the account's email address. Aborted.");
      process.exit(1);
    }
  }

  const deleted = await deleteUserEverywhere(db, footprint.user.id);
  console.log(`Deleted ${footprint.user.email} — ${deleted} row(s) removed.`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
