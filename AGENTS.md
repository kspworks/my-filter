<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:project-conventions -->

# My Filter — project conventions

## Imports

The module alias is `~/*` → `./src/*` (see `compilerOptions.paths`). Never `@/*`; if the
shadcn CLI writes `@/` imports, fix them and check `components.json` aliases.

## Dates

Two different things, deliberately stored differently:

- **Calendar dates** (`installedOn`, `lastChangedOn`, `changedOn`) are `TEXT 'YYYY-MM-DD'`.
  They are wall-clock facts. Parse them with `parseISO` (never `new Date(string)`, which
  parses as UTC and shifts the day), and compare with `differenceInCalendarDays`.
- **Instants** (`createdAt`, `updatedAt`) are `integer({ mode: 'timestamp_ms' })` on app
  tables and `mode: 'timestamp'` on better-auth tables (their convention).

"Today" is computed on the **client** (`~/lib/use-today`), because the server's timezone
is not the user's. All due-date math lives in `~/lib/due-date.ts` and is unit-tested.

## API responses

No superjson. Procedures select explicit columns and must not return `Date` objects —
otherwise the client type says `Date` while the wire carries a string. Keep using the
`systemColumns` / `consumableColumns` projections.

## Ownership

Systems and consumables are private per user and always will be. Every query filters on
`eq(table.userId, ctx.user.id)`; mutations check the returned row and throw `NOT_FOUND`
(never `FORBIDDEN`, which leaks existence). `userId` is never accepted from the client.
Anything touching a `systemId` from input must call `assertOwnsSystem` first.
`src/server/trpc/routers/ownership.test.ts` covers this — extend it with every new procedure.

## Replacement log

`consumables.lastChangedOn` is a denormalization of `MAX(changed_on)` in
`consumable_replacements`. Any write that touches the log must end with `syncLastChanged`
inside the same transaction, so the two can never drift.

## i18n readiness

Enum-like values (`type`, `intervalUnit`) are stored as stable keys and rendered through
`~/lib/labels.ts`; dates are formatted only in `~/lib/format-date.ts`. Keep display text
out of the database and out of ad-hoc `toLocaleDateString` calls.

<!-- END:project-conventions -->
