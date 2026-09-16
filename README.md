# My Filter

Track the consumable cartridges in your home water filter (reverse osmosis) systems, and
see at a glance what is overdue for replacement.

Filters have staggered service intervals — sediment every 6 months, the membrane every
24, the post-carbon every 12 — and nobody remembers them. So the two things this app
optimises for are **seeing what is overdue** and **marking something replaced in one
click**.

## Stack

TypeScript · Next.js 16 (App Router) · tRPC 11 · Drizzle ORM over libSQL/SQLite ·
better-auth · Zod · @t3-oss/env-nextjs · date-fns · next-intl · next-themes ·
Tailwind 4 + shadcn/ui · lucide-react · Biome · Vitest

## Getting started

```bash
pnpm install
cp .env.example .env      # then fill in BETTER_AUTH_SECRET
pnpm db:migrate
pnpm db:seed              # optional: demo account with data in mixed states
pnpm dev
```

Generate a secret with `openssl rand -base64 32`.

The seed creates `demo@myfilter.app` / `demo-password` with two systems and nine
consumables — some overdue, some due soon, one unassigned. Re-running it deletes and
recreates that user, which also signs out any open session for it. The daily digest
never emails this account, so it is safe to seed in production for demonstrations.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server on http://localhost:3000 |
| `pnpm build` / `pnpm start` | Production build / serve |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` / `pnpm lint:fix` | Biome check (and autofix) |
| `pnpm test` | Vitest — unit, router/database integration and component tests |
| `pnpm test:coverage` | The same, with a coverage report and thresholds |
| `pnpm test:e2e` | Playwright against a production build |
| `pnpm test:all` | Both suites |
| `pnpm db:generate` | Create a migration from schema changes |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm db:seed` | Reset and seed the demo account |
| `pnpm db:backfill-locales` | Give every existing account a language, once |
| `pnpm db:backup` | Write a restorable SQL dump into `./data/` |
| `pnpm db:delete-user` | Delete one account and all of its data |

## How it is put together

**Data model.** A *system* is a filter unit (manufacturer, model, installation date). A
*consumable* is a physical cartridge with its own service interval, owned by the user and
optionally attached to one system — detaching leaves it on an "Unassigned" shelf rather
than deleting it. Deleting a system detaches its consumables instead of destroying them.

Every replacement is appended to `consumable_replacements`, and `consumables.lastChangedOn`
is a denormalization of the newest entry maintained in the same transaction. That is what
makes the **Undo** on the replacement toast possible, and what a service-history view is
built on.

**Privacy.** Systems and consumables are private per user and will never be shareable, so
ownership is enforced on every single query rather than modelled as permissions. Another
user's row is indistinguishable from one that does not exist (`NOT_FOUND`, not
`FORBIDDEN`). `src/server/trpc/routers/ownership.test.ts` holds that line, and
`auth-gate.test.ts` walks the router so every *new* procedure is checked the day it lands.

**Tests.** The suite is built to be run after a dependency upgrade, so it leans on real
seams rather than mocks. Router tests run against an in-memory SQLite built from the actual
migrations; component tests use tRPC's `unstable_localLink`, so a click in a rendered
component travels through react-query, the real router, Zod and Drizzle into that database
— nothing stubs `fetch`. Playwright covers what Vitest structurally cannot: async Server
Components, the auth redirects, the locale Server Action and Radix overlays. See the
**Tests** section of `AGENTS.md` for the conventions.

**Dates.** Calendar dates are stored as `TEXT 'YYYY-MM-DD'`; instants as epoch
milliseconds. "Today" is determined in the browser, not on the server, so a due date is
never a day off because of the server's timezone. The arithmetic lives in
`src/lib/due-date.ts` and is unit-tested, including month-end clamping (31 Jan + 1 month
= 28 Feb) and DST boundaries.

## Deploying

`DATABASE_URL` is the only thing that changes between environments:

| Environment | `DATABASE_URL` |
| --- | --- |
| Local | `file:./data/my-filter.db` |
| Tests | `:memory:` |
| Production | `libsql://<db>.turso.io` + `DATABASE_AUTH_TOKEN` |

A file-backed SQLite cannot be the production store on serverless hosts (the filesystem is
ephemeral), which is why the app talks to libSQL from the start. To deploy on Vercel:
create a Turso database, set `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `BETTER_AUTH_SECRET`
and `BETTER_AUTH_URL`, and run `pnpm db:migrate` against the remote URL.

### Backups

`pnpm db:backup` dumps whatever `DATABASE_URL` points at, so taking a copy of production is
a matter of running it locally with production credentials:

```bash
DATABASE_URL="libsql://<db>.turso.io" DATABASE_AUTH_TOKEN="<token>" pnpm db:backup
```

It writes `data/<database>-<date>.sql` — a second run the same day lands beside the first
rather than over it — and prints a row count per table. `/data` is gitignored, which matters:
the dump contains better-auth password hashes and live session tokens.

It is a plain SQL script because nothing else is portable here. Turso has no binary export
over the client library, and depending on the `turso` CLI or a `sqlite3` binary would mean a
backup you cannot take from a fresh clone. Restoring does want one of those, though:

```bash
turso db shell <database> < data/my-filter-2026-09-15.sql   # or
sqlite3 restored.db < data/my-filter-2026-09-15.sql
```

The dump disables foreign keys before `BEGIN` — the tables come out in `sqlite_master` order,
which knows nothing about which references which — and keeps the `__drizzle_migrations` table,
so a restored copy does not try to re-apply every migration.

### Deleting an account

`pnpm db:delete-user <id or email>` prints what it would remove and stops. `--confirm` makes
it real; against a remote `DATABASE_URL` it *also* asks for the account's email to be typed
back, and refuses outright with no terminal to ask in unless `--yes` says that is deliberate.
`NODE_ENV` is no help there — a script run from a laptop against Turso is "development" by
every measure Node has — so a non-`file:` URL is what stands in for production.

## Language and theme

English and Ukrainian, chosen from the header and remembered in a cookie. There is no
`/uk/` URL prefix and no middleware: `src/i18n/request.ts` resolves the cookie, falling
back to `Accept-Language` and then English, so a first-time Ukrainian visitor lands in
Ukrainian without a redirect.

Getting Ukrainian right is mostly about **plurals**. It has four categories where English
has two, and the `one` category includes 21 and 101 — so "in 1 day / in 3 days" is
*через 1 день / через 3 дні / через 5 днів / через 21 день*. Every count therefore goes
through an ICU message rather than a `=== 1` check, and `src/i18n/messages.test.ts` asserts
the forms at 1, 3, 5, 11, 21 and 22. The same test fails the build if the two catalogues
drift apart or an ICU message stops compiling.

Translating never touches stored data. Enum-like values were already stable keys, and the
two places that *did* write English into the database have been fixed: applying a preset
now creates cartridges named in the user's own language (ordinary, editable user data from
then on), and the replacement log stores no label at all — whether an entry is the
installation, the most recent, or a plain replacement follows from its position.

The UI is **dark by default**, with a Light/Dark/System toggle beside the language picker.
The theme is kept in `localStorage` and applied by a pre-paint script, so there is no
flash and no cost to prerendering.

## Not in this iteration

Email notifications and a mobile layout. Neither needs a migration to add.
