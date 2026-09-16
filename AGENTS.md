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

The cookie is per-browser, so it is invisible to anything running without a request — which
means the daily digest. `setLocale` therefore *also* writes `user_settings.locale`, and so
does the sign-in hook in `src/server/auth.ts`. The cookie stays authoritative for rendering;
the row exists only so a background job knows what language to write in. Two writers, and
the difference between them is load-bearing: `saveUserLocale` records a **choice** and
overwrites, `defaultUserLocale` records a **guess** and only fills an empty row. A request
that says nothing writes nothing at all — a default written down is indistinguishable from a
choice afterwards, and would block every later, better signal.

The jsdom project aliases `~/i18n/set-locale` to a stub for two reasons now: the real
module's `cookies()` throws outside a request scope, *and* it reaches `~/server/db`, which
would drag `src/env.ts` into every component test that renders the language switcher or the
register form.

Display text lives in exactly three places:

- **`~/lib/labels.ts`** — enum-like values (`type`, `intervalUnit`, `DueStatus`) are stored
  as stable keys and rendered through `useLabels()`.
- **`~/lib/format-date.ts`** — the only module that formats a date. No ad-hoc
  `toLocaleDateString`, and never localize the `yyyy-MM-dd` pattern in `~/lib/due-date.ts`:
  that one is machine serialization. It is pure and has no `"use client"`, because the digest
  formats the same dates with no React anywhere; the hooks that bind it to the reader's
  language live in `~/lib/use-format-date`, the way `use-today` sits beside `due-date`.
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

## Notifications

A daily email digest of cartridges needing replacement: a warning fourteen days out and a
notice on the day itself, combined into one message when both apply — `src/server/mail`
(transport) and `src/server/notifications` (the job), behind a Vercel cron at `0 9 * * *`.

**The sent-log is the mechanism, not a record of one.** `notification_log` has a unique index
on `(consumable_id, kind, due_on)`, and `run.ts` *claims* rows with
`onConflictDoNothing().returning()` — a row that comes back is a notice nobody has sent.
Never re-derive "already sent" from dates: matching an exact day instead loses a reminder
permanently whenever a run fails, and says nothing about cartridges that were already
overdue. Claim, then send, then delete the claim if the send throws, so a failure is a
day's delay rather than a lost or duplicated email.

**The cron is the one place the server decides what "today" is.** Everywhere else that is
the viewer's own (`~/lib/use-today`), deliberately, because the server's timezone is not
theirs — but a background job has no viewer. `todayInTimeZone(DIGEST_TIME_ZONE, …)` resolves
it in `Europe/Kyiv`, so the schedule drifting an hour across DST never changes *which*
cartridges are reported. This is a considered inversion of the rule above, not an oversight.

`MAIL_TRANSPORT` defaults to `"log"`, so `next build`, CI and a fresh clone all work with no
mail secrets at all; `readMailConfig` validates only the transport actually selected, and
`src/app/api/cron/digest/route.ts` stays a four-line injector so `cron.ts` can be driven by a
real `Request` without importing the database singleton. Adding a provider is one file
implementing `MailTransport` and one arm in `create-transport`.

Never filter recipients on `user.emailVerified` — nothing in this app ever sets it true.
The one recipient that *is* filtered is the seeded demo account (`DEMO_EMAIL` in
`~/lib/demo`), in `loadNotifiable` itself, so it is never a candidate nor a claim.

## Theme

Dark by default, via next-themes (`src/components/theme-provider.tsx`), with a
Light/Dark/System toggle. `globals.css` declares `@custom-variant dark (&:is(.dark *))`, so
the provider uses `attribute="class"` — not `data-theme`. `<html>` needs
`suppressHydrationWarning` because the pre-paint script sets that class before React runs;
for the same reason, never branch on `useTheme()`'s value during render (the theme toggle
picks its icon with `dark:` classes instead). The theme is deliberately in `localStorage`,
not a cookie: reading a cookie in the root layout opts the whole app out of prerendering.

<!-- END:project-conventions -->

## Operational scripts

`scripts/` holds the things run by hand: `db:seed`, `db:backfill-locales`, `db:backup` and
`db:delete-user`. They are `tsx` entry points, so no top-level `await` — tsx compiles to CJS
here — and the logic they need lives under `src/` instead, where Vitest can reach it
(`include: ["src/**/*.test.ts"]`). Neither `~/server/db/dump.ts` nor
`~/server/db/delete-user.ts` imports the `db` singleton: they take a handle as a parameter,
so `makeTestDb()` can drive them.

**A non-`file:` `DATABASE_URL` is what "production" means here.** `NODE_ENV` cannot tell:
a script run from a laptop against Turso is `"development"` by every measure Node has, and
the README already says the URL is the only thing that changes between environments.
`describeTarget` in `~/server/db/target.ts` is the one place that decides, and it also strips
credentials out of the URL before anything prints or writes it.

`deleteUserEverywhere` deletes each user-scoped table **explicitly**, children first, rather
than leaning on the `ON DELETE cascade` every one of them declares (which is what
`scripts/seed.ts` does). SQLite only enforces foreign keys when `PRAGMA foreign_keys=ON` —
a per-connection setting this code does not own — and a cascade reports nothing about what it
took, while the CLI has to show a footprint before it asks. `verification` is left alone on
purpose: no `user_id`, and nothing in this app writes to it.

The backup is a SQL dump rather than a file copy because there is no portable way to get a
binary one: `@libsql/client` cannot copy a Turso database, and `turso`/`sqlite3` are not
dependencies. `RESTORE_PREAMBLE` is exported separately from the dump body for a reason —
SQLite ignores `PRAGMA foreign_keys` inside a transaction, so it has to be written *above*
the `BEGIN` the file wraps everything else in.

## Tests

The suite exists to be run **after a dependency upgrade** and believed, so it favours
integration over isolation: pure arithmetic rarely breaks on an upgrade, seams with
libraries do.

**The file extension picks the environment.** `*.test.ts` runs in the `node` project (pure
logic, routers, the database); `*.test.tsx` runs in the `dom` project (jsdom + React Testing
Library). Tests sit next to the code they cover. Shared harness lives in `~/test-utils`,
which is never imported by app code.

- **`~/test-utils/db`** — `makeTestDb()` gives a `:memory:` database built from the real
  migrations in `./drizzle`. Always `close()` it in `afterEach`; each one holds a native
  connection.
- **`~/test-utils/caller`** — `callerFor(db, userId, locale)` calls procedures directly.
  Keep `TRPCContext` an `import type`: a value import would pull `~/server/db` and therefore
  `src/env.ts` into every test's module graph.
- **`~/test-utils/render`** — `setupApp()` returns `{ render, caller, db, queryClient }`.
  The tRPC client is built on `unstable_localLink`, so a component's `useQuery` runs the
  **real** router, Zod parse and SQL. There is no fetch mocking and there are no fixtures to
  drift.

Rules worth knowing before writing one:

- **Seed through `app.caller`, never raw inserts with invented ids.** `zId` is
  `refine(isCuid)`, so `"sys-1"` is rejected — and `isCuid` is a loose heuristic that
  *accepts* a bare word like `"nope"`, so pick genuinely malformed ids (a hyphen works) when
  testing rejection.
- **After anything that triggers a query or mutation, assert with `findBy*` / `waitFor`.**
  The local link resolves on a microtask, so a bare `getBy*` both flakes and warns about
  updates outside `act()`.
- **Pin "today" with `vi.useFakeTimers({ toFake: ["Date"] })`.** Faking only `Date` keeps
  react-query's timers and `user-event` working while `useToday()` stays put.
- **Do not drive a Radix `Select` or `DropdownMenu` in jsdom.** It has no pointer capture
  and no layout, so those tests fail for reasons that have nothing to do with the app.
  `e2e/interactions.spec.ts` covers them in a real browser.
- **`src/server/auth.test.ts` and `src/server/trpc/http.test.ts` are the only files that
  import the real `~/server/db` singleton.** They rely on Vitest's per-file isolation; do not
  set `isolate: false`.

E2E (`pnpm test:e2e`) runs against `pnpm build && pnpm start`, not `next dev`, because that
is where the React Compiler runs and where async Server Components, the two layout
redirects and the locale Server Action actually exist. `pnpm test` stays Vitest-only so the
fast loop needs no browser binaries.
