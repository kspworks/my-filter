# My Filter

Track the consumable cartridges in your home water filter (reverse osmosis) systems, and
see at a glance what is overdue for replacement.

Filters have staggered service intervals — sediment every 6 months, the membrane every
24, the post-carbon every 12 — and nobody remembers them. So the two things this app
optimises for are **seeing what is overdue** and **marking something replaced in one
click**.

## Stack

TypeScript · Next.js 16 (App Router) · tRPC 11 · Drizzle ORM over libSQL/SQLite ·
better-auth · Zod · @t3-oss/env-nextjs · date-fns · Tailwind 4 + shadcn/ui ·
lucide-react · Biome · Vitest

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
recreates that user, which also signs out any open session for it.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server on http://localhost:3000 |
| `pnpm build` / `pnpm start` | Production build / serve |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` / `pnpm lint:fix` | Biome check (and autofix) |
| `pnpm test` | Vitest — due-date logic and per-user isolation |
| `pnpm db:generate` | Create a migration from schema changes |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm db:seed` | Reset and seed the demo account |

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
`FORBIDDEN`). `src/server/trpc/routers/ownership.test.ts` holds that line.

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

## Not in this iteration

Email notifications, a mobile layout, and i18n. The schema and code are arranged so none
of them need a migration: enum-like values are stored as stable keys and rendered through
`src/lib/labels.ts`, and all date formatting goes through `src/lib/format-date.ts`.
