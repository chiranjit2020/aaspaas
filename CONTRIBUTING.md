# Contributing to AasPaas

Welcome — whether you're here for a class project, to learn Next.js/MongoDB on a
real (small) codebase, or just to fix something that bugs you. This doc is the
short version of "how to actually get a change merged." For *what* the app is
and *why* it's built the way it is, read `01-product-vision.md` through
`07-roadmap-and-architecture.md` first — this file assumes you've skimmed at
least `07`.

## Get set up

Follow the README's "Getting started" section first — `npm install`, copy
`.env.example` to `.env.local`, fill in a MongoDB URI (your own free Atlas
cluster is fine for local dev; don't ask anyone for access to `aaspaas_prod`),
`npm run create-indexes && npm run seed`, `npm run dev`.

If anything in that flow doesn't work as described, that's itself a good
first contribution: fix the docs or the script, not just your local setup.

## Before you write code

1. **Check the milestone status** at the bottom of the README, and
   `07-roadmap-and-architecture.md` §4. If the thing you want to build is in a
   milestone that hasn't started yet, open an issue first — there's likely a
   reason it's sequenced where it is (usually: a later milestone depends on a
   schema decision an earlier one hasn't made yet).
2. **Search existing issues** before opening a new one — small project,
   likely overlap.
3. For anything more than a one-line fix, open an issue describing what
   you're planning *before* you write it. A 400-line PR that duplicates
   someone else's in-flight work, or takes a direction that doesn't fit the
   architecture, wastes your time more than a two-line "here's my plan"
   comment would have.

## While you're writing it

- **Follow the existing pattern**, don't introduce a new one. If you're
  adding a route, find the most similar existing route first and match its
  shape (auth check → rate limit if applicable → zod validation → DB lookup →
  mutation → response). If you're adding DB access, put it behind a
  `getXCollection()` accessor in `lib/db/models/`, not an inline
  `db.collection("x")` in a route.
- **Every new collection needs an index entry** in `scripts/createIndexes.ts`
  *and* a schema entry in `src/types/domain.ts` — these two files are meant
  to stay the source of truth, not implicit knowledge in someone's head.
- **No fake data, ever.** This is the one rule with zero exceptions in this
  codebase. If a number is displayed, it's computed from a real query. If a
  feature would require inventing placeholder numbers to look finished
  (reputation levels, badges, leaderboards are the recurring examples — see
  M4's commit history for why those were deliberately *not* built yet),
  don't build the display until the real mechanic exists. A stub that says
  "not implemented yet" is honest; a hardcoded "Level 3 🏆" is not.
- **Validate at the API boundary with zod**, never trust a client. Every
  route that reads a body or query params has a zod schema in
  `lib/validation/*` — add yours there, not inline in the route (unless it's
  truly a one-route, one-use schema — see `moderation/watchlist/[id]/route.ts`
  for that exception).
- **Never trust a client-supplied user id.** `createdBy`, `userId`, actor
  identity — always comes from the authenticated session
  (`getCurrentUser(request).sub`), never from the request body, even if the
  body happens to carry one. Search the codebase for "the session always
  wins" to see the pattern and its test.
- **Pure logic goes in its own file, separate from DB access.** If you're
  writing scoring/matching/validation logic that doesn't itself need a
  database, write it as a pure function (no imports of `lib/db/connect.ts` or
  anything that touches it) and put the DB-gathering wrapper in a sibling
  file. This isn't a style preference — a file that statically imports the DB
  connection throws immediately if `MONGODB_URI` isn't set at import time,
  which breaks unit tests that don't need a database at all. `lib/trust/`
  has three examples of this split (`duplicateScoring`/`duplicateDetection`,
  `spamScoring`/`spamScore`).

## Tests

- Unit-test the pure logic you just wrote. If you can't unit-test it without
  spinning up a database, it probably belongs in a DB-touching wrapper around
  something pure that *can* be tested — see the split above.
- If you touched an API route, add or update an integration test in
  `tests/integration/` against the real route handler and an in-memory Mongo
  (`mongodb-memory-server`) — not a mock. Look at any existing file in that
  folder for the pattern (env vars set *before* any dynamic `import()`, never
  a static top-level import of anything DB-touching).
- `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build` all
  need to pass before you open a PR. CI runs all four (plus `npm audit`) and
  will block the merge otherwise.

## Opening a PR

- Conventional Commits for the title (`feat:`, `fix:`, `chore:`, `docs:`,
  `refactor:`, `test:`).
- Describe what changed and, more importantly, *why* — especially for any
  judgment call (a spec ambiguity you resolved one way, a scope decision you
  made). Future-you and future-reviewers need the reasoning, not just the
  diff.
- Small PRs merge faster and get better review than large ones. If your
  change naturally splits into "the schema/backend piece" and "the UI piece,"
  consider two PRs.

## What not to do

- Don't skip a milestone's stated scope to build something from a later one,
  even if it seems easy — the sequencing in `07-roadmap-and-architecture.md`
  §4 exists because later milestones assume earlier ones landed a specific
  way (M5's spam scoring assumes M3's duplicate detection and M4's report/vote
  data exist, for example).
- Don't add a new dependency for something the standard library or an
  existing dependency already does. If you think you need one, say why in
  the PR description — it's a real cost (supply-chain surface, bundle size)
  that needs a real reason.
- Don't commit a real secret anywhere, including `.env.example` — that file
  is deliberately the *one* `.env*` file that's tracked in git precisely
  because it's meant to be safe to share; keep it placeholder-only.

## Questions

Open an issue with the `question` label, or comment on the specific issue
your question relates to. There's no separate chat/Discord for this project
at V1 scale — the issue tracker is the whole communication channel, and
that's deliberate (searchable history beats a chat log that scrolls away).
