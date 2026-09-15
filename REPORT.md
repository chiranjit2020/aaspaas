# AasPaas — Build Report & System Design Notes

*Written for the person building this app, as a learning reference — not a pitch
doc. Every claim below was checked against the actual code/tests/git history as of
commit `d14e8cd` on `feat/geo-maps-radius-search`, not against what the spec docs
(`01`–`08`, `AGENTS.md`) merely describe. Where the docs and the code disagree,
that's called out explicitly — it's a useful thing to notice, not swept under the
rug.*

---

## 0. How to read this

`07-roadmap-and-architecture.md` is the spec: what was *planned*, in milestones
M0–M6, plus Phases 4–8 as "future hooks." This file is the as-built audit: what
of that plan is *actually wired up and tested right now*, plus a plain-language
walkthrough of how the pieces actually talk to each other — the thing you said
you have no clue about yet.

Checkboxes: `[x]` = implemented, tested, and reachable from a real route/page.
`[~]` = partially built (the type/field exists, or a stub exists, but the real
logic doesn't). `[ ]` = not started.

---

## 1. TL;DR

- **M0–M6 (the entire planned V1) are done.** That covers: auth, browse/search,
  add-a-place, duplicate detection, a moderation queue with RBAC, edit
  proposals, reports, useful-votes, spam scoring, rate limiting, and a
  pre-launch hardening pass.
- **Phase 4 (Geo/Maps)** — originally slotted for *after* V1 — was pulled
  forward and is also done: browser geolocation, a Leaflet map, and "near me"
  radius search.
- On top of the spec, four unplanned UX features were added: a homepage
  **Discovery Surface**, a **Local Pulse** widget, a real **contributor profile
  page**, and an **onboarding tour**.
- **Today's session's fix:** the spam-score router used to auto-publish
  low-risk submissions with zero human involvement. That's now disabled —
  every new place and every edit proposal requires an explicit moderator
  approval, no matter how clean the score is. See §4 of this file and
  `07-roadmap-and-architecture.md` §2.2 for the detail.
- **Not started:** Phase 5 (business claiming), Phase 6 (social/network layer),
  Phase 7 (monetization), Phase 8 (scale-out infra) — these were always
  "later," and nothing in V1 blocks them (that's by design, see §5.6).
- **Real gaps inside "done" milestones** worth knowing about: no photo upload
  (Cloudinary was speced, never built), reputation levels never actually
  compute (every account is permanently `"newcomer"`), no end-to-end
  (Playwright) tests despite the SDLC plan calling for 2–3, and `README.md`'s
  status line is stale (says Phase 4 "not yet started" — it now is).

---

## 2. Feature checklist

### M0 — Scaffold + CI
- [x] Next.js 16 + TypeScript + Tailwind v4, App Router
- [x] ESLint + Prettier
- [x] GitHub Actions CI (`.github/workflows/ci.yml`): checkout → npm ci →
      `npm audit --audit-level=high` → lint → typecheck → **unit AND
      integration tests** (both run under `npm test` — see §4) → `next build`
- [x] Dependabot (`.github/dependabot.yml`)
- [x] Health-check route: `GET /api/health` — pings Mongo, returns 200/503
- [~] "3 separate Atlas databases (dev/staging/prod)" — this is an environment
      convention, not something visible in the repo; can't verify from code
      alone, take on faith or check your own Vercel/Atlas dashboards

### M1 — Data model + seed + read-only browse/search
- [x] `places` / `categories` schema (`src/types/domain.ts`)
- [x] All indexes from §1.4, plus several added later as real query patterns
      emerged — the actual list lives in `scripts/createIndexes.ts` (treat that
      file, not the doc prose, as the source of truth)
- [x] `scripts/seed.ts` — seed data generator
- [x] `GET /api/places` (browse) and `GET /api/search` (free-text + filters) —
      both are the same underlying engine, see §3.6
- [x] Home search UI + place detail page (`src/app/(public)/`)

### M2 — Auth + add-place flow
- [x] `users` collection, register → email-verify → login
- [x] bcrypt (cost 12) + JWT access token (15 min, `jose`, httpOnly cookie) +
      opaque refresh token (30 days, rotated on every use, hashed at rest)
- [x] Transactional email via Resend (`src/lib/email/sendVerificationEmail.ts`)
- [x] Authenticated "Add a Place" form → `POST /api/places`
- [x] Login **requires** `emailVerified` — fixed 2026-09-14 (this was a real
      bug: an unverified account could log in and act; see git history
      `be473b5`)

### M3 — Duplicate detection + moderation queue
- [x] `lib/trust/duplicateDetection.ts` + `duplicateScoring.ts` — name
      similarity (Levenshtein) + same locality + <200m proximity (haversine) +
      phone match, surfaced to the submitter *before* creation as a 409 with
      candidates
- [x] Moderation queue UI (`src/app/moderation/page.tsx`) +
      `GET /api/moderation/queue`
- [x] `roles` field (`CONTRIBUTOR` / `MODERATOR` / `ADMIN`) + route guards
      (`assertModerator`, re-checked from the DB on every call, never trusted
      from the JWT)
- [x] Approve/reject transitions, logged to `moderation_actions`

### M4 — Contributor profile + reputation stats + edit/report flows
- [x] Public profile page `/u/[username]` — deliberately minimal (no XP, no
      badges, no reputation level shown — see §4, reputation isn't real yet)
- [x] `place_edits` collection + "suggest an edit" UI + moderation approval
- [x] `reports` collection + "report incorrect info" UI + resolve flow
      (kept / corrected / removed)
- [x] `useful_votes` with a unique `(placeId, userId)` index — one vote per
      user per place, enforced at the DB layer, not just in application code
- [x] Denormalized `stats` counters on `users` (placesAdded, correctionsMade,
      reportsFiled, usefulVotesReceived, rejectedSubmissions, ...), updated on
      every relevant event
- [~] **Reputation levels** — the enum exists
      (`newcomer → local_explorer → community_scout → trusted_contributor →
      local_guide`) and is read in several places (rate-limit tier,
      spam-score adjustment), but **nothing ever promotes a user out of
      `newcomer`**. This was a deliberate, documented deferral (see
      `src/lib/rateLimit/tiers.ts`'s own comment), not an oversight — but it
      means the "trusted contributor gets a faster track" story is currently
      inert for every real account.

### M5 — Spam-score gating
- [x] `lib/trust/spamScoring.ts` (pure scorer, 0–100) +
      `lib/trust/spamScore.ts` (DB-backed signal gathering) — see §3.5 for the
      full mechanism
- [x] Mongo-counter rate limiting (`lib/rateLimit/index.ts`), tiered by
      account age/verification/reputation (`lib/rateLimit/tiers.ts`)
- [x] Submission cooldown on rejection (`lib/trust/cooldown.ts`, 48h flat)
- [x] Unit tests on scoring edge cases (`tests/unit/spamScoring.test.ts`)
- [x] **Changed 2026-09-15:** originally, a low-risk score auto-published a
      place / auto-applied an edit with zero moderator involvement (that was
      the actual M5 "DONE WHEN" acceptance criterion). You flagged that as a
      problem, so this is now disabled — see §4.

### M6 — Hardening pass (pre-launch)
- [x] `08-hardening-audit.md` — a real walkthrough of the §2 threat table,
      what was checked, and what was fixed. Worth reading directly; it's the
      most "senior engineer" document in this repo.
- [x] Rate limits tuned, zod coverage audited, RBAC audited, informal load
      test of `/api/search`, PII surfaces confirmed (locality only — though
      see the Phase 4 addendum below, which *reversed* part of this)

### Phase 4 — Geo/Maps *(pulled forward, done ahead of schedule)*
- [x] Browser geolocation (`src/hooks/use-geolocation.ts`)
- [x] Leaflet map components (`src/components/map/`) — a results map and a
      per-place mini-map
- [x] "Near me" radius search: `$geoNear` aggregation stage, 5km default /
      25km max radius (`lib/search/buildQuery.ts`'s `buildGeoSearchPipeline`)
- [x] Distance-sorted cursor pagination (see §3.6/§3.7)
- ⚠️ **Product decision embedded here:** Phase 4 made `location: {lat, lng}`
  *publicly* returned on every place (`PlaceSummary.location` in
  `src/types/domain.ts:218-226`) — reversing M6's own "PII surfaces show
  locality only, never lat/lng" hardening rule. The code comment defends this
  (address was already public via "Directions" links), but it's a real,
  documented reversal of an earlier security decision, not an oversight —
  worth understanding if you're auditing this yourself later.

### Unplanned extras (not in the original roadmap at all)
- [x] **Discovery Surface** (`lib/discovery/getDiscoverySurface.ts`) — "what's
      new this month," a real aggregation over actual published places, not
      invented numbers. Deliberately returns nothing rather than a fake "+0"
      badge.
- [x] **Local Pulse** (`lib/discovery/getLocalPulse.ts`) — same honesty
      principle, one featured locality's real new-place count.
- [x] **Onboarding tour** (`src/components/onboarding/onboarding-tour.tsx`)
- [x] Design-system pass (typography, dark mode default, brand palette,
      contributor identity on place cards)

### Not started (by design — see §5.6 on why this is safe)
- [ ] Phase 5 — Business claiming (`ownerId` field and the claim flow)
- [ ] Phase 6 — Network/social layer (activity feed, leaderboards)
- [ ] Phase 7 — Monetization (`tier: "free"` field exists, nothing reads it
      yet)
- [ ] Phase 8 — Scale-out infra (Redis rate limiting, dedicated search engine)
- [ ] Photo upload (Cloudinary) — speced in `07-roadmap-and-architecture.md`
      §1.2/§1.5 (`place_photos` collection, `POST /api/places/[id]/photos`)
      but never built. No `lib/storage/`, no photo route, no upload UI exist.
- [ ] End-to-end tests (Playwright) — the SDLC section calls for 2–3 flows;
      `tests/` only has `unit/` and `integration/`, no `e2e/`.

---

## 3. How the engine actually works

This is the part written for "I have no clue how this actually works."
Read it top to bottom once; after that it's a reference.

### 3.1 The one deployable unit

There is no separate backend. Next.js API routes (`src/app/api/**/route.ts`)
*are* the backend — same process, same deploy, as the React pages. A browser
request either renders a page (React Server Component) or hits a `route.ts`
file that looks like a tiny Express handler: it gets a `NextRequest`, does
stuff, returns a `NextResponse`.

```
Browser ──HTTPS──▶ Next.js (Vercel)
                      ├── App Router pages   (React, some server-rendered)
                      └── API routes         (route.ts files, one per URL)
                              │
                              ▼
                         MongoDB Atlas (one client, reused across requests —
                         see lib/db/connect.ts)
```

Every route handler follows the same shape, which is the single most
important pattern to internalize in this codebase:

```
1. Authenticate  (read a cookie, verify JWT)      → getCurrentUser()
2. Authorize     (re-check role from DB if it matters) → assertModerator()
3. Rate-limit    (per-IP or per-account counter)  → checkRateLimit()
4. Validate      (zod schema, reject bad input)   → *.safeParse()
5. Do the actual work (DB read/write)
6. Return a shaped response — never a raw Mongo document
```

Look at any `route.ts` file and you'll see this exact skeleton. That
repetition is deliberate, not duplication-that-should-be-refactored — each
step is a distinct security boundary, and Next.js route handlers are
intentionally "just functions," not a framework with middleware chains, so
the boundary stays visible in the code instead of hidden in config.

### 3.2 The data layer

One MongoDB database, ~10 collections. `src/types/domain.ts` is the
authoritative schema — read it before reading any route handler; every
document shape used anywhere in the app is defined there, once.

```
users                  accounts, roles, stats, reputation
email_verification_tokens
refresh_tokens
categories             + a synonyms[] array (this is what makes "fix my tap"
                        resolve to "plumber" — see §3.6)
places                 the actual directory entries
place_edits             proposed corrections to a place
reports                 "this is wrong/closed/spam" flags
useful_votes            one vote per (place, user) — unique-indexed
moderation_actions      an append-only audit log of every mod action
rate_limit_counters     fixed-window counters, TTL-expired automatically
```

`_id` is always a MongoDB `ObjectId` — that's the real primary key
everywhere. `username` and `email` are each separately unique-indexed on
`users`, but neither is *the* key; login accepts either as an "identifier"
(`src/app/api/auth/login/route.ts:44`, `$or: [{username}, {email}]`).

**Why Mongo and not Postgres?** Two real technical reasons show up in the
code, not just "it's what was chosen": (1) `2dsphere` geospatial indexes +
`$geoNear` make "near me" search a native aggregation stage instead of a
bolted-on PostGIS extension; (2) the document model matches
`place_edits.changes: { field: { old, new } }` and `moderation_actions`
naturally — audit-log-shaped data that would otherwise be an awkward EAV
table in a relational schema.

Indexes (`scripts/createIndexes.ts`) matter because Mongo does a full
collection scan without one. The two worth understanding by name:
- `2dsphere` on `places.location` — required for any `$geoNear` or `$near`
  query to work at all.
- The `text` index on `name`(weight 10)/`description`(weight 1) — required
  for `$text: {$search: ...}`, and it's why free-text search and geo search
  are two *separate* pipelines (§3.7 explains why).

### 3.3 Auth engine

Three token types, each solving a different problem:

| Token | Where it lives | Lifetime | Why |
|---|---|---|---|
| Access JWT | httpOnly cookie, `SameSite=Lax` | 15 min | Stateless "is there a session" check — no DB hit needed on every request |
| Refresh token | httpOnly cookie, scoped to `/api/auth` only | 30 days | Opaque random token, **hashed** in the DB (`sha256`, `lib/auth/tokens.ts`) so it's revocable — a bare JWT can't be revoked, this can |
| Email-verification token | emailed link | 24h, single-use | Same opaque+hashed pattern |

The JWT is intentionally *not* the source of truth for anything sensitive.
It carries `roles` for convenience, but `assertModerator()`
(`src/lib/auth/requireModerator.ts`) re-reads the role **fresh from the DB**
on every moderation call — the code comment explains why: a JWT is up to 15
minutes stale, so a just-revoked moderator would still hold a valid-looking
token for the rest of that window if the DB weren't re-checked.

**Refresh rotation** (`src/app/api/auth/refresh/route.ts`): every refresh
call revokes the old refresh token and issues a brand new one. This means a
stolen-but-unused refresh token becomes worthless the instant the real user
refreshes — that's the standard "rotate on use" pattern, and it's why
`refresh_tokens` stores `revoked: boolean` instead of just deleting used
tokens (deleting would also work, but keeping a revoked record lets you spot
"someone tried to reuse a dead token" as a signal later, if you ever wanted
to).

### 3.4 Submitting a place — full trace

This is the single best example in the codebase for seeing every layer work
together. Follow `POST /api/places`
(`src/app/api/places/route.ts`) top to bottom:

1. **Auth** — `getCurrentUser(request)` reads the access cookie, verifies the
   JWT. No session → 401.
2. **Account check** — re-fetches the user doc, confirms
   `accountStatus === "active"`.
3. **Cooldown check** — if a past bad submission set
   `submissionCooldownUntil` in the future, block with a 403.
4. **Rate limit** — `resolveSubmissionTier()` picks restricted/standard/
   trusted based on email-verified + account age (+ reputation, currently
   inert — see §2/M4), then `checkRateLimit()` enforces that tier's daily cap
   via a Mongo counter document.
5. **Validate** — `placeInputSchema.safeParse(body)` (zod). Bad shape → 400,
   with field-level issues.
6. **Duplicate check** — `findPossibleDuplicates()` scores every existing
   place in the same locality by name similarity + proximity + phone match.
   If something looks like a dupe and the client hasn't already
   acknowledged it, the API returns **409 with the candidates** instead of
   creating anything — the client shows a warning, and a second request with
   `acknowledgeDuplicates: true` proceeds.
7. **Spam score** — `scorePlaceSubmission()` computes a 0–100 risk score
   (§3.5) and decides the initial `status`.
8. **Insert** — the place document is written with that status, plus the
   score/reasons stored for audit, plus a slug (`makeUniquePlaceSlug`).
9. **Side effects** — `user.stats.placesAdded` increments; if rejected, a
   48h cooldown is set on the account.

Nine layers, one request. Every one of them is a separate, independently
testable module (`lib/trust/*`, `lib/rateLimit/*`, `lib/validation/*`) — the
route handler itself is mostly just calling them in order and translating
results into HTTP responses. That's the "route handlers never contain the
logic themselves" rule from the roadmap doc, and it's the reason this app is
actually readable at this size.

### 3.5 Trust engine — duplicate detection + spam scoring + moderation

Two *separate* deterministic scoring systems (no ML, on purpose — a plain
point-based rule is auditable and unit-testable in a way a model isn't):

**Duplicate detection** (`lib/trust/duplicateScoring.ts` + wrapper
`duplicateDetection.ts`) — pure functions: Levenshtein-distance name
similarity, haversine distance for "<200m," phone-number match. Runs
*before* a place is created, blocking creation until the submitter
acknowledges.

**Spam score** (`lib/trust/spamScoring.ts` pure scorer +
`spamScore.ts` DB-gathering wrapper) — a running point total from:
account age, email-verified, submission velocity (other submissions in the
last 24h), name/description text heuristics (ALL CAPS, spam phrases, URL
stuffing — plain regexes), same-phone reuse across other listings, prior
reports against the user, past rejected submissions, geo-consistency (does
the pincode match what's normally seen in that locality), all offset by a
negative adjustment for reputation level.

```
routeBySpamScore(score):
   0-20   → auto_publish
  21-50   → watchlist
  51-75   → pending_review
  76-100  → rejected_cooldown
```

**As of today**, `scorePlaceSubmission`/`scorePlaceEdit`
(`lib/trust/spamScore.ts`) collapse the first three outcomes into a single
`pending` status — the score is still computed and stored (moderators see
it, and it's what a future "sort the queue by risk" feature would use), but
nothing auto-publishes anymore. Only `rejected_cooldown` still acts
automatically, and it *blocks* rather than skips review, so that doesn't
reopen the gap. This is the exact thing you asked about earlier in this
session; see the git commit `d14e8cd` for the full before/after.

**Moderation** (`src/app/api/moderation/**`) is the human layer on top:
`GET /api/moderation/queue` returns pending places, pending edits, open
reports, and (now-dormant, see below) watchlist items in one call
(`lib/moderation/getModerationQueue.ts`). Approve/reject routes only ever
act on documents still in `pending` — approving a place does a conditional
`findOneAndUpdate({_id, status: "pending"}, {$set: {status: "published"}})`,
which is also a concurrency guard: if two moderators click approve at the
same instant, only one update actually matches and succeeds.

*Note:* the "watchlist" (score 21-50, published-but-flagged) is a real,
working feature (`getModerationQueue`'s `getWatchlist()`,
`POST /api/moderation/watchlist/[id]`) but as of today's policy change it's
a dead code path for new submissions — nothing currently *produces* a
watchlist entry, since nothing auto-publishes anymore. The reader still
works; it just has nothing to read going forward.

### 3.6 Search engine

`GET /api/places` (browse, no query) and `GET /api/search` (free text +
filters) are **the same engine** — "browse" is just "search with an empty
free-text term." Both call `lib/search/service.ts`'s `searchPlaces()`. Four
stages:

1. **`parseQuery.ts`** — pure, DB-free tokenizer. Splits the raw string into
   words, then tries the *longest* multi-word window first (so "north 24
   parganas" matches as one locality before falling back to single tokens),
   checking each phrase against: a 6-digit regex → pincode; the categories'
   `synonyms[]` array → category (this is the "fix my tap" → plumber trick);
   known locality/district strings. Whatever's left over is free text.
2. **`buildQuery.ts`** — pure, DB-free. Turns the parsed filters into a Mongo
   aggregation pipeline. Exact filters (`locality`, `pincode`, `categoryId`)
   become a `$match`. Free text ≥3 chars uses `$text: {$search}`; shorter
   than that falls back to a prefix regex, because Mongo's `$text` can't do
   prefix matching (so typing "pl" for "plumber" wouldn't match anything via
   `$text` alone).
3. **`rank.ts`** — computes `rankScore = textScore*10 + ln(usefulCount+1)*3
   - ln(notUsefulCount+1)*2 + recencyBoost`. The log-scaling on vote counts
   is deliberate: a linear `usefulCount*2` term would let a place with 500
   votes dominate raw text relevance; `ln(1+n)` keeps 10 votes and 500 votes
   only a few points apart, so a genuinely better text match still wins.
4. **Cursor pagination** — *not* `skip/limit*.* Each page's cursor encodes
   the last row's `(sortValue, _id)` as a base64url string; the next page
   asks Mongo for "rows that sort strictly after this tuple," which stays
   fast at any offset (`skip(100000)` gets slower as the offset grows;
   cursor-based doesn't). This is a genuinely important, widely-applicable
   pattern — see §5 below.

### 3.7 Geo/maps — "near me"

`buildGeoSearchPipeline()` is a **separate** pipeline from the text-search
one, not a conditional branch inside the same one — because MongoDB
literally forbids combining `$geoNear` with `$text` in one aggregation, and
`$geoNear` must be the pipeline's very first stage. `service.ts` picks
whichever pipeline applies (geo mode activates only when both `lat` and
`lng` are present) — they're mutually exclusive per request. Inside geo
mode, free text always falls back to a prefix regex (never `$text`), since
`$geoNear`'s `query` option doesn't support it. Results sort by
`distanceMeters` ascending instead of `rankScore` descending; the cursor
codec (`rank.ts`) is generic over which field a pipeline sorts by, so it's
one implementation, not two.

### 3.8 Rate limiting

`lib/rateLimit/index.ts` — a fixed-window counter stored as a single Mongo
document per `(key, windowIndex)` pair, upserted with `$inc`. A TTL index on
`expiresAt` cleans old windows up automatically (no cron job needed). This
is explicitly *not* Redis, and explicitly documented as a placeholder for
Redis later — the module's narrow interface (`checkRateLimit({key, limit,
windowMs})`) is what makes that swap possible without touching any route
handler. `lib/rateLimit/tiers.ts` is the *policy* layer on top (who gets how
many submissions/edits/votes/reports per day), kept separate from the
counter *mechanism* so the policy can be unit-tested without touching Mongo
at all.

### 3.9 Validation

Every route's request body goes through a zod schema
(`lib/validation/*.ts`) before touching the database — `schema.safeParse()`,
never trusting client-side validation. These schemas are the single source
of truth for "what shape is valid," and because zod schemas are plain
TypeScript values, the same schema could (in principle) drive a client-side
form's validation too, though this app currently duplicates some of that in
form components rather than importing the schema directly on the client
(worth checking if you want a "don't repeat validation rules" cleanup
later).

---

## 4. Known gaps, drift, and things worth understanding as *decisions*, not bugs

- **Reputation levels never compute.** Every account is `"newcomer"`
  forever. The rate-limit "trusted contributor gets 25/day" tier and the
  spam-score reputation discount both *read* `reputationLevel`, but nothing
  *writes* it except at registration. This is documented as deliberate (see
  `lib/rateLimit/tiers.ts`'s comment), not hidden — but it means two
  "finished" features (M5's tiered limits, M2's trust discount) are
  currently only exercised by test fixtures that hand-set a reputation
  level, never by real user behavior.
- **No photo upload.** Speced (`place_photos` collection,
  `POST /api/places/[id]/photos`, Cloudinary), never built. No
  `lib/storage/`, no route, no `<PhotoUpload>` component.
- **No e2e tests.** The SDLC plan calls for 2–3 Playwright flows
  (anonymous search, register→add place→see it pending, report→moderation
  queue). Only `tests/unit/` and `tests/integration/` exist.
- **The `"flagged"` place status is dead.** It's in the `PlaceStatus` type
  union and shows up in a couple of `$in` query filters, but nothing ever
  actually sets a place's `status` to `"flagged"` — the real "flagged for
  review while still live" concept is represented differently, as
  `status: "published"` + a `spamScore` in the 21–50 band (the "watchlist").
  Confusing if you go looking for where `"flagged"` gets set and find
  nothing — now you know why.
- **`README.md`'s status line is stale.** It says "Phases 4+ are future
  work, not yet started" — but Phase 4 (Geo/Maps) is done (see §2). Worth
  fixing next time you touch that file.
- **PII stance reversal.** M6's hardening pass established "public
  responses show locality only, never raw lat/lng." Phase 4 quietly
  reversed that for `PlaceSummary.location` (see §2's Phase 4 entry). Not a
  bug — but if you're doing a security pass later, don't assume the M6 audit
  doc's PII section still describes current behavior without checking the
  Phase 4 addendum in `08-hardening-audit.md`.
- **Today's fix:** auto-publish/auto-approve by spam score is now disabled
  end-to-end (routes, tests, and both spec docs updated to match) — see
  commit `d14e8cd`. This was a real, working, tested feature before today; it
  wasn't a bug, it was a product decision you overrode.

---

## 5. System-design ideas this app is a working example of

Since the whole point of building this is to learn system design, here's
where to point yourself at *this specific codebase* for each concept —
these aren't abstract textbook definitions, they're "go read this exact
file" pointers.

1. **Layered request handling / separation of concerns.** Every route
   handler is auth → authorize → rate-limit → validate → business logic →
   response-shaping, and each of those is a separate, independently-testable
   module (`lib/auth`, `lib/rateLimit`, `lib/validation`, `lib/trust`,
   `lib/search`). See §3.1 and §3.4.
2. **Stateless vs. stateful auth tokens, and why you need both.** The JWT
   (§3.3) is fast but can't be revoked before it expires. The refresh token
   is slow (a DB hit) but *can* be revoked — that's the whole reason it's an
   opaque hashed token in a DB table, not another JWT. Rotate-on-use turns a
   stolen refresh token into a one-time-use liability instead of a
   long-lived one.
3. **Defense in depth via re-checking authority server-side.**
   `assertModerator()` never trusts the JWT's `roles` claim — it re-reads
   from the DB every time. This is the standard fix for "stale token still
   claims a revoked privilege."
4. **Cursor-based pagination vs. offset pagination.** `rank.ts`'s
   `encodeCursor`/`decodeCursor`/`buildCursorMatchStage` is a clean, small
   reference implementation of "why `.skip(N)` doesn't scale" — worth
   reading even outside this project.
5. **Idempotent database guards via conditional updates.** Every
   approve/reject moderation route does
   `findOneAndUpdate({_id, status: "pending"}, {$set: {...}})` — the status
   check inside the *same* atomic operation is what prevents a double-approve
   race, not an earlier separate read-then-write (which would have a TOCTOU
   gap).
6. **Designing for a future you're not building yet.** §5 of
   `07-roadmap-and-architecture.md` ("Future phases — just the hooks") is a
   genuinely good example of *speculative-generality done right*: reserved
   nullable fields (`ownerId`, `tier`) and isolated modules with narrow
   interfaces (`lib/rateLimit`, `lib/search`), instead of building the
   unneeded feature now. The payoff is real — Phase 4 (geo/maps) slotted in
   without a schema migration because `location` was already a GeoJSON
   `Point` with a `2dsphere` index from M1.
7. **Fixed-window rate limiting, and its known trade-off.** The
   `rate_limit_counters` collection (§3.8) is the simplest correct rate
   limiter you can build without a dedicated service — but it's worth
   knowing (and this codebase's own comments admit) that fixed-window allows
   a burst right at a window boundary (e.g. a user could submit near the end
   of one window and again right at the start of the next, getting roughly
   double the intended rate in a short span). A sliding-window or
   token-bucket algorithm fixes that; this app deliberately didn't bother for
   V1 scale.
8. **Deterministic scoring vs. ML, and why "deterministic" was the right
   call here.** Both `duplicateScoring.ts` and `spamScoring.ts` are plain
   point-additions over named signals — no model, no training data, no
   black box. Every score is explainable ("this reason contributed +15
   points") which matters enormously for a moderator who needs to justify a
   rejection to a real person. That's a real, generalizable lesson: don't
   reach for ML when a deterministic rule is auditable, testable, and
   sufficient.
9. **Audit logging as its own collection, not a side-effect field.**
   `moderation_actions` is append-only and separate from the resource it
   acts on — every approve/reject/dismiss writes one document there. That
   pattern (immutable event log, separate from current-state documents)
   generalizes far beyond this app.
10. **Normalization vs. denormalization, deliberately mixed.**
    `users.stats.placesAdded` etc. are denormalized counters, updated on
    every relevant write, purely for read performance (a public profile page
    shouldn't have to `COUNT(*)` across places on every view). Meanwhile
    `useful_votes` and `reports` are kept as their own real collections
    (not embedded arrays on `places`) specifically so a future feature can
    query across them independently — see Phase 6's note in the roadmap doc.
    Two different data-modeling choices in the same schema, each for a
    stated reason — worth noticing they're not the same call and why.

---

## 6. Where to look in the code for X

| If you want to understand... | Start here |
|---|---|
| The whole schema, one place | `src/types/domain.ts` |
| The whole planned architecture | `07-roadmap-and-architecture.md` |
| What the M6 hardening pass actually checked | `08-hardening-audit.md` |
| A single request's full lifecycle | `src/app/api/places/route.ts` (§3.4) |
| Auth end to end | `src/lib/auth/{jwt,session,tokens,password}.ts` |
| Search end to end | `src/lib/search/{parseQuery,buildQuery,rank,service}.ts` |
| Spam/trust scoring | `src/lib/trust/{spamScoring,spamScore,duplicateScoring,duplicateDetection}.ts` |
| Moderation | `src/lib/moderation/getModerationQueue.ts`, `src/app/api/moderation/**` |
| Rate limiting | `src/lib/rateLimit/{index,tiers}.ts` |
| Geo/maps | `src/hooks/use-geolocation.ts`, `src/components/map/`, `buildGeoSearchPipeline` in `buildQuery.ts` |
| Tests as documentation | `tests/integration/*.test.ts` — each file's `describe` block is basically a spec for the route it covers |

---

*This file is a snapshot. Re-generate or update it after any milestone-sized
change — it'll drift the same way `README.md`'s status line already has.*
