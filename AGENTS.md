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

## i18n

English and Ukrainian, via next-intl. Message catalogues are `src/messages/{en,uk}.json`
and must stay structurally identical — `src/i18n/messages.test.ts` fails on a missing key,
an untranslated string or a broken ICU message.

The active locale lives in a **cookie**, not the URL. There is no `[locale]` segment and no
`proxy.ts` (Next 16's rename of middleware) — `src/i18n/request.ts` resolves cookie →
`Accept-Language` → `en`. Switching writes the cookie through the Server Action in
`src/i18n/set-locale.ts` and calls `router.refresh()`; cookies cannot be set while a Server
Component renders.

Display text lives in exactly three places:

- **`~/lib/labels.ts`** — enum-like values (`type`, `intervalUnit`, `DueStatus`) are stored
  as stable keys and rendered through `useLabels()`.
- **`~/lib/format-date.ts`** — the only module that formats a date. No ad-hoc
  `toLocaleDateString`, and never localize the `yyyy-MM-dd` pattern in `~/lib/due-date.ts`:
  that one is machine serialization.
- **the catalogues** — anything else a person reads.

**Never build a plural by hand.** Ukrainian has four categories to English's two, and its
`one` category includes 21, 31 and 101 (1 день / 3 дні / 5 днів / 21 день). Every count goes
through an ICU `{count, plural, …}` message. For the same reason, never assemble a sentence
from JSX fragments around an interpolated value — word order differs. Use one parameterized
message, and wrap interpolated user data in guillemets (`«{name}»`) so the surrounding
grammar does not have to decline it.

Server-side, procedures raise errors through `ctx.t` (see `src/server/trpc/context.ts`,
which reads the locale off the request's `Cookie` header). Do **not** reach for
`getTranslations()` from `next-intl/server` in a router — `ownership.test.ts` calls routers
directly through `createCallerFactory`, where no request scope exists.

Keep display text out of the database. `consumables.name` is user data: `applyPreset`
resolves a preset's cartridge name in the caller's language *once*, at creation, and never
re-translates it. The replacement log stores no label at all — which entry is the
installation, the most recent or a plain replacement is derived from its position.

## Theme

Dark by default, via next-themes (`src/components/theme-provider.tsx`), with a
Light/Dark/System toggle. `globals.css` declares `@custom-variant dark (&:is(.dark *))`, so
the provider uses `attribute="class"` — not `data-theme`. `<html>` needs
`suppressHydrationWarning` because the pre-paint script sets that class before React runs;
for the same reason, never branch on `useTheme()`'s value during render (the theme toggle
picks its icon with `dark:` classes instead). The theme is deliberately in `localStorage`,
not a cookie: reading a cookie in the root layout opts the whole app out of prerendering.

<!-- END:project-conventions -->
