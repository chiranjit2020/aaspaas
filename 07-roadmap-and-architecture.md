Six conversations got you the vision, the brand, the contributor model, the search
philosophy, the recognition loop, and the AI concept. **This document is where all of
that stops being an idea and becomes something you can actually build.**

Everything below is scoped to **Phases 1–3 only** — Directory, Community, Trust. That's
the real V1. Phases 4–8 (claiming, maps, network, monetization, scale) get one paragraph
each at the end, just enough to make sure V1 doesn't accidentally block them.

One rule for this whole document: **no "eventually we can experiment with X."** Every
number, field name, and route below is the actual thing to build. If something really is
for later, it says exactly which milestone.

---

# 1. System Architecture

## 1.1 The shape of it

You don't need a separate backend service yet. Next.js API routes *are* your backend
for V1 — one deployable unit, one repo, one mental model.

```text
Users (browser / mobile browser)
        │  HTTPS
        ▼
   Vercel Edge (CDN, routing, static assets)
        │
        ▼
   Next.js App (TypeScript)
   ├── App Router pages       (React UI)
   └── API routes             (serverless functions)
        │
        ├──► MongoDB Atlas
        │      users · places · categories · place_edits
        │      reports · useful_votes · moderation_actions
        │      (2dsphere + text + compound indexes)
        │
        ├──► Cloudinary
        │      place photo upload / resize / CDN
        │
        └──► OpenStreetMap tiles + Leaflet
               (renders client-side, no server hop at all)
```

Deploy pipeline is equally simple:

```text
GitHub (push / PR)
     │
     ▼
GitHub Actions CI
   lint → typecheck → unit tests → build
     │
     ▼
Vercel
   PR  → preview deployment
   main → production deployment
     │
     ▼
MongoDB Atlas
   dev / staging / prod — separate databases, same cluster
```

**Why Cloudinary and not S3:** you get resize/optimize/CDN out of the box, a free tier
that comfortably covers V1 (25GB storage+bandwidth), and zero infrastructure to run.
Signed uploads happen through an API route so the API secret never reaches the browser.
If you later want AWS on your resume, Cloudflare R2 is the natural swap — but don't do
that swap now, it buys you nothing at this stage.

## 1.2 Folder structure

```text
/
├── .github/workflows/ci.yml
├── .env.example
├── src/
│   ├── app/
│   │   ├── (public)/page.tsx                 → home / search
│   │   ├── (public)/places/[id]/page.tsx     → place detail
│   │   ├── (public)/u/[username]/page.tsx    → contributor profile
│   │   ├── (auth)/login/page.tsx
│   │   ├── (auth)/register/page.tsx
│   │   ├── (auth)/verify-email/page.tsx
│   │   ├── add-place/page.tsx
│   │   ├── moderation/page.tsx               → admin-only queue UI
│   │   └── api/
│   │       ├── auth/register/route.ts
│   │       ├── auth/login/route.ts
│   │       ├── auth/verify-email/route.ts
│   │       ├── auth/refresh/route.ts
│   │       ├── auth/logout/route.ts
│   │       ├── search/route.ts
│   │       ├── places/route.ts               → GET list, POST create
│   │       ├── places/[id]/route.ts          → GET, PATCH (propose edit)
│   │       ├── places/[id]/report/route.ts
│   │       ├── places/[id]/useful/route.ts
│   │       ├── places/[id]/photos/route.ts
│   │       ├── places/[id]/edits/route.ts
│   │       ├── categories/route.ts
│   │       ├── users/me/route.ts
│   │       ├── users/[username]/route.ts
│   │       └── moderation/
│   │           ├── queue/route.ts
│   │           ├── places/[id]/approve/route.ts
│   │           ├── places/[id]/reject/route.ts
│   │           ├── edits/[id]/route.ts
│   │           └── reports/[id]/resolve/route.ts
│   ├── lib/
│   │   ├── db/connect.ts                     → Mongo client singleton, serverless-safe
│   │   ├── db/models/{user,place,category,placeEdit,report,usefulVote}.ts
│   │   ├── auth/{jwt,password,session}.ts
│   │   ├── validation/*.ts                   → zod schemas, shared client + server
│   │   ├── search/{parseQuery,buildQuery,rank}.ts
│   │   ├── trust/{duplicateDetection,spamScore,reputation}.ts
│   │   ├── rateLimit/index.ts
│   │   └── storage/upload.ts                 → Cloudinary wrapper
│   ├── components/
│   └── types/
├── scripts/
│   ├── seed.ts
│   ├── createIndexes.ts
│   └── migrations/*.ts
└── tests/{unit,integration,e2e}/
```

Notice `lib/search`, `lib/trust`, and `lib/rateLimit` are their own isolated modules with
narrow interfaces. That's deliberate, not tidiness for its own sake — it's the reason
Phase 8 (dedicated search engine, Redis) is a module swap later instead of a rewrite.
Route handlers call these modules; they never contain the logic themselves.

## 1.3 The authoritative schema

Files 01 and 03 sketched two slightly different versions of this. This is the one that
actually ships — `latitude`/`longitude` becomes a GeoJSON `Point`, because that's what
MongoDB's geospatial indexes and `$geoNear` actually want.

```text
users
  _id
  displayName
  username                 unique, lowercase
  email                    unique
  emailVerified            bool
  passwordHash
  roles                    ["CONTRIBUTOR"] (+ BUSINESS_OWNER, MODERATOR, ADMIN later)
  locality, district       self-reported, optional — locality-level only
  reputationLevel          newcomer | local_explorer | community_scout |
                           trusted_contributor | local_guide
  stats                    { placesAdded, placesVerified, correctionsMade,
                             reportsFiled, usefulVotesReceived,
                             rejectedSubmissions, spamReportsAgainst }
  accountStatus            active | suspended | banned
  createdAt, updatedAt, lastLoginAt

email_verification_tokens
  userId, tokenHash, expiresAt, usedAt

refresh_tokens
  userId, tokenHash, issuedAt, expiresAt, revoked, userAgent

categories
  _id, slug, name, parentCategoryId?, icon
  synonyms: [string]        ← this is what makes "fix my tap" resolve to "plumber"

places
  _id, name, slug, categoryId, description, phone?
  district, locality, pincode
  location: { type: "Point", coordinates: [lng, lat] }
  address?
  createdBy      → users._id
  ownerId?       null        ← reserved for Phase 5 (claiming), untouched in V1
  status         pending | published | flagged | rejected | removed
  spamScore      number
  verificationCount, usefulCount, notUsefulCount
  duplicateOfPlaceId?
  createdAt, updatedAt

place_photos
  _id, placeId, url, uploadedBy, uploadedAt, moderationStatus

place_edits
  _id, placeId, userId, changes: { field: { old, new } }
  reason, status: pending | approved | rejected, reviewedBy?, createdAt

reports
  _id, placeId, userId
  reason: duplicate | closed | wrong_info | spam | inappropriate | other
  details, status: open | reviewing | resolved
  resolvedBy?, resolution?: kept | corrected | removed
  createdAt

useful_votes                 ← new, not in the original brainstorm — needed to
  _id, placeId, userId          enforce one vote per user per place
  value: useful | not_useful
  createdAt

moderation_actions           ← audit log
  _id, actorId, action, targetType, targetId, notes, createdAt
```

## 1.4 Indexes — run these on day one

```text
places        2dsphere on location
places        text index: name (weight 10), description (weight 1)
places        compound: { district, locality, pincode, categoryId, status }
users         unique: username
users         unique: email
useful_votes  unique compound: { placeId, userId }
reports       { status, createdAt: -1 }        → moderation queue sort
place_edits   { placeId, createdAt: -1 }
refresh_tokens TTL index on expiresAt
```

This list *is* `scripts/createIndexes.ts`. Write it once, run it as part of `M0`.

## 1.5 API surface (Phases 1–3)

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/auth/register` | POST | none | create account, send verification email |
| `/api/auth/login` | POST | none | password check, issue tokens |
| `/api/auth/verify-email` | POST | none (token) | consume verification token |
| `/api/auth/refresh` | POST | refresh cookie | rotate access token |
| `/api/auth/logout` | POST | session | revoke refresh token |
| `/api/search` | GET | none | free-text + filtered search |
| `/api/places` | GET | none | list/browse places |
| `/api/places` | POST | verified user | submit a new place |
| `/api/places/[id]` | GET | none | place detail |
| `/api/places/[id]` | PATCH | verified user | propose an edit |
| `/api/places/[id]/report` | POST | verified user | file a report |
| `/api/places/[id]/useful` | POST | verified user | useful / not-useful vote |
| `/api/places/[id]/photos` | POST | verified user | upload a photo |
| `/api/places/[id]/edits` | GET | none | edit history |
| `/api/categories` | GET | none | category list (incl. synonyms) |
| `/api/users/me` | GET | session | own profile |
| `/api/users/[username]` | GET | none | public contributor profile |
| `/api/moderation/queue` | GET | moderator/admin | pending items |
| `/api/moderation/places/[id]/approve` | POST | moderator/admin | publish a place |
| `/api/moderation/places/[id]/reject` | POST | moderator/admin | reject a place |
| `/api/moderation/edits/[id]` | POST | moderator/admin | approve/reject an edit |
| `/api/moderation/reports/[id]/resolve` | POST | moderator/admin | close a report |

## 1.6 The search pipeline, made real

File 04's dream was "type anything, get the right answer." Here's how that actually
happens on top of Mongo, not a hypothetical search engine:

```text
1. Client debounces input (~300ms) → GET /api/search?q=...

2. parseQuery.ts tokenizes the query:
     6-digit numeric token           → PIN
     token matches locality/district → location filter
     token matches a category's
       synonyms array                → category filter
     everything left over            → free-text term

3. buildQuery.ts composes the Mongo query:
     exact filters  → hit the compound index
     free text      → $text search (or prefix regex for short/incomplete queries,
                       since $text doesn't do prefix matching)
     if a locality centroid or geolocation exists →
       prepend a $geoNear aggregation stage

4. rank.ts sorts by combined score:
     text relevance ($meta: "textScore")
     + distance
     + usefulCount
     + small recency boost

5. Cursor-based pagination (not skip/limit — stays fast as data grows)
```

An in-process cache for the top-N popular query strings is enough for V1. A dedicated
search engine or Redis-backed cache is a Phase 8 problem, not a launch-week one.

---

# 2. Security Architecture

Your actual attack surface isn't exotic. It's: people spamming fake places, people
gaming the trust system, people scraping the data, and the usual web-app basics done
carelessly. Handle those four categories well and you're in good shape.

| Threat | Vector | Mitigation | Enforced in |
|---|---|---|---|
| Fake/duplicate places | Copy-paste submissions, slight name variations | Synchronous check on submit: name similarity + same locality + <200m proximity + phone match → surfaced to the submitter *before* creation | `lib/trust/duplicateDetection.ts`, called from `POST /api/places` |
| Sockpuppets / self-voting | Multiple accounts voting up your own listing | Unique index on `(placeId, userId)`; email verification required before votes/reports count; per-account daily caps | `useful_votes` schema + `POST /api/places/[id]/useful` |
| DB scraping | Bulk-pulling the whole directory | Page size capped at 50, per-IP rate limits on `/api/search` and `/api/places`, no bulk-export endpoint, ObjectIds not sequential | `lib/rateLimit` |
| Stored XSS via name/description/photos | Malicious HTML/script in free-text fields, disguised file uploads | User text is never rendered as HTML — plain React escaping only, never `dangerouslySetInnerHTML`; photo uploads content-sniffed (not extension-checked), re-encoded, EXIF stripped, size-capped before Cloudinary | `lib/storage/upload.ts`, all display components |
| IDOR on edit/report/vote endpoints | Guessing another user's resource IDs | One `assertCanAccess(resource, user)` helper, used by every mutating route — look up the resource first, check ownership/role second, never trust a client-supplied ID alone | shared helper in `lib/auth` |
| Auth weaknesses | Credential stuffing, token theft | bcrypt cost 12; access JWT (15 min) in httpOnly Secure `SameSite=Lax` cookie; refresh token (7–30 days), rotated on use, stored **hashed** so it's revocable; email-verification tokens: 32-byte random, hashed at rest, 24h expiry, single-use | `lib/auth/{jwt,password,session}.ts` |
| Abuse via volume | A new/bad-faith account hammering the API | See rate-limit tiers below, tied to account age and reputation | `lib/rateLimit`, checked in route middleware |
| Bad input reaching the DB | Malformed or malicious payloads | zod schemas in `lib/validation/*`, shared by client forms and API routes as the single source of truth — reject at the API boundary, never trust client-side validation alone | every `route.ts` under `api/` |
| Moderation privilege escalation | Stale JWT claiming a role that's since been revoked | Role is re-checked fresh from the DB on every `/api/moderation/*` call, never trusted from the token alone; every action written to `moderation_actions` | moderation route handlers |
| PII exposure | Over-collecting or over-exposing personal data | Only displayName / username / email / password are ever collected — no Aadhaar, phone, DOB, or full address; public API responses and profiles show **locality only**, never lat/lng or email | `users` schema, `/api/users/[username]` |
| Secrets leakage | Committed or shared credentials | Per-environment env vars on Vercel (Development/Preview/Production), `.env.local` gitignored, `.env.example` documented, least-privilege DB users per environment | `.env.example`, Vercel project settings |
| Supply-chain drift | Vulnerable or malicious dependencies | `npm audit` as a CI step, Dependabot/Renovate enabled, lockfile committed | `.github/workflows/ci.yml` |

## 2.1 Rate-limit tiers (concrete, not aspirational)

```text
Unverified / <7 days old:
  3 place submissions/day · 10 edits/day · 20 votes/day · 5 reports/day

Verified, Local Explorer+:
  10 place submissions/day

Trusted Contributor+:
  25 place submissions/day, fast-track publish

Anonymous reads (/api/search, /api/places):
  60 requests/min/IP

Login:
  5 attempts / 15 min per IP+username, exponential backoff
```

Implementation for V1: a Mongo-backed counters collection checked in route middleware.
No Redis. When this becomes an actual bottleneck — not before — Upstash Redis is the
drop-in replacement, and `lib/rateLimit`'s narrow interface is exactly why that swap
won't touch route handlers.

## 2.2 The spam score, wired to real code

File 06 described a 0–100 spam score. Here's where it actually lives and what it
actually does: `lib/trust/spamScore.ts`, computed server-side inside `POST /api/places`
and the edit-proposal handler, and stored on the place document for audit.

**Inputs:** account age, email verification, submission velocity, the
duplicate-similarity score from `duplicateDetection.ts`, count of other places sharing
the same phone number, regex-based suspicious-text heuristics (ALL CAPS, URL/phone
stuffing, known spam phrases — no ML needed for V1), reports filed against the user,
reputation level (lowers risk), past rejected submissions, and locality/pincode
geographic consistency.

**Thresholds, and what they actually do to `places.status`:**

```text
 0–20   → status = published                (auto-publish)
21–50   → status = published, flagged=true  (appears on a moderator watchlist)
51–75   → status = pending                  (goes to the moderation queue)
76–100  → status = rejected                 (submitter gets a 24–72h submission cooldown)
```

One rule doesn't move, no matter how convenient it would be to skip it: **the score
routes a submission. It never bans, suspends, or deletes an account.** That always
requires an explicit action by a moderator/admin, logged to `moderation_actions`.

---

# 3. SDLC

You're building this alone, at least for now. The process below is deliberately light —
but it's still a *process*, not "commit straight to main and hope." The goal is
discipline that costs you almost nothing solo, and doesn't need to be rebuilt the day a
student wants to send you a PR.

**Git:** trunk-based on `main`, short-lived branches (`feat/`, `fix/`, `chore/`),
Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`). Open a
PR even when it's just you — that's what gets you a Vercel preview deploy per change and
a habit of reviewing your own diff before it merges.

**Environments:** three separate databases even on one Atlas cluster —
`aaspaas_dev`, `aaspaas_staging`, `aaspaas_prod`. Local dev points at `dev`; Vercel
Preview deployments point at `staging`; `main` → production → `prod`.

**CI** (`.github/workflows/ci.yml`, GitHub Actions):

```text
checkout → setup Node (cached) → npm ci
  → lint (eslint)
  → typecheck (tsc --noEmit)
  → unit tests
  → build (next build)
  → (optional) integration tests against mongodb-memory-server
```

`main` is branch-protected: CI must pass before merge. Vercel deploys independently
through its own GitHub integration — CI is the quality gate, not the deployer.

**Testing priority, in order:**

1. Unit tests on the actual engineering core — `duplicateDetection`, `spamScore`,
   `parseQuery`, the zod validation schemas. Aim near-100% here; this logic *is* the
   product.
2. Integration tests on API routes against an in-memory Mongo: register→verify→login,
   place create→pending→published, report→resolve, vote-uniqueness, RBAC denial for
   non-admins.
3. A handful of Playwright e2e tests — 2–3 flows max (anonymous search, register→add
   place→see it pending, report→moderation queue). Run these on merge to `main` or
   nightly, not on every PR — keep CI fast.

**Code review, solo edition:** a self-review checklist before opening a PR — did new
logic get tests, did auth/moderation paths get extra scrutiny, is a new dependency
justified, does anything leak PII — then run `/code-review` on the diff as a mandatory
second pass. Triage every finding: fix it, or write down why not, in the PR description.

**Release/rollback:** `main` = production. Vercel auto-deploys on merge; rollback is
Vercel's instant redeploy-of-previous-deployment, no custom tooling. Tag GitHub Releases
at milestone boundaries (`v0.1-m1`, etc.). Schema changes are small idempotent scripts
under `scripts/migrations/`, logged to a `migrations_applied` collection — no migration
framework needed at this size, but the discipline starts on day one so it isn't a mess
to introduce later.

**Tracking:** GitHub Issues + a simple Projects board, labels (`area:search`,
`area:auth`, `area:moderation`, `type:bug`, `priority`), GitHub Milestones mapped 1:1 to
M0–M6 below.

---

# 4. Milestones

Not calendar dates — solo/part-time pace is unpredictable, and a fake deadline just
becomes a source of guilt. Each milestone has a real Definition of Done instead.

```text
M0 — Scaffold + CI
  Next.js + TS + Tailwind init · ESLint/Prettier · GitHub repo · Vercel project
  (3 envs) · Atlas cluster + 3 databases · .env.example · GitHub Actions CI ·
  a health-check route.
  DONE WHEN: main deploys on Vercel, CI is green on a PR.

M1 — Data model + seed + read-only browse/search
  places/categories schema + indexes via createIndexes.ts · seed script
  (~50–100 real Habra places) · GET /api/places · GET /api/search · home
  search UI + place detail page.
  DONE WHEN: "mobile repair habra" returns ranked seeded results in <500ms
  locally. No write paths exist yet.

M2 — Auth + add-place flow
  users collection · register/login/verify-email · bcrypt + JWT cookies +
  refresh rotation · transactional email (Resend or SendGrid free tier) ·
  authenticated "Add a Place" form → POST /api/places (always lands
  `pending` at this stage — spam scoring isn't wired in until M5) ·
  contributor's own-submissions list.
  DONE WHEN: a new user can register → verify → login → submit → see it
  pending, and it stays invisible in public search until published.

M3 — Duplicate detection + moderation queue
  duplicateDetection.ts · "possible duplicate" confirmation step in the
  add-place UI · moderation queue UI + /api/moderation/* · role field +
  route guards · approve/reject transitions.
  DONE WHEN: a near-duplicate name+locality triggers a pre-submit warning;
  an admin can approve/reject from a queue; approvals show up in search.

M4 — Contributor profile + reputation stats + edit/report flows
  public profile page with raw stats · place_edits + "suggest an edit" UI +
  moderation approval · reports + "report incorrect info" UI · useful_votes
  with unique-vote enforcement · denormalized stat counters updated on
  every relevant event.
  DONE WHEN: profile stats stay accurate as edits/reports/votes flow
  through moderation.

M5 — Spam-score gating
  spamScore.ts per Section 2.2's formula, wired into POST /api/places and
  edit proposals so status is auto-routed instead of always `pending` ·
  Mongo-counter rate limiting per the tiers above · cooldown enforcement ·
  unit tests on scoring edge cases.
  DONE WHEN: a rapid-fire new/unverified account gets auto-flagged or
  rejected per the thresholds; a trusted contributor's clean submission
  auto-publishes; thresholds are fully unit-tested.

M6 — Hardening pass (pre-launch)
  Walk every mitigation in Section 2 and confirm it's actually implemented ·
  tune rate limits based on real usage · audit zod coverage across every
  route · audit RBAC on every ownership check · informal load test of
  /api/search · confirm PII surfaces show locality only · confirm Vercel
  env-var scoping is correct · write a short student-contributor onboarding
  doc · define an Atlas backup/export plan.
  DONE WHEN: the Section 2 checklist is fully checked and you're ready to
  hand ~100 students a link without the system collapsing or filling with
  unmanaged garbage.
```

---

# 5. Future phases — just the hooks

You don't build these now. You make sure V1 doesn't accidentally make them harder later.

**Phase 4 — Geo/maps.** `places.location` is already a GeoJSON `Point` with a
`2dsphere` index from V1. "What's around me" radius search and a Leaflet map view are
additive query/UI work — browser geolocation plus a `$geoNear` stage — not a schema
change.

**Phase 5 — Business claiming.** `places.ownerId` (nullable) and a future
`BUSINESS_OWNER` role in `users.roles` are already reserved. Claiming becomes a new
`business_claims` collection (`placeId`, `userId`, `proof`, `status`) reviewed by an
admin, which then sets `ownerId`. No restructuring of core collections.

**Phase 6 — Network/social.** `useful_votes` and `reports` are already separate
collections, not embedded arrays, specifically so a future activity feed or locality
leaderboard can query across them directly. Leaderboards compute off the `stats` fields
already on `users`.

**Phase 7 — Monetization.** Reserve a `tier` field on `places` (default `"free"`) and
design result cards with a slot for a future "Sponsored" label now. Turning that on
later is a config change, not a UI redesign.

**Phase 8 — Scale-out infra.** `lib/rateLimit`, `lib/search`, and `lib/storage` are
isolated modules with narrow interfaces from day one. Swapping the Mongo-counter rate
limiter for Upstash Redis, or Mongo text search for a dedicated engine (Meilisearch,
Algolia), is a module replacement, not a rewrite. Docker, AWS, queues, a CDN beyond
Vercel's, and real observability get introduced only once the Vercel/Atlas free-and-hobby
tiers are actually outgrown — not preemptively.

---

That's the whole build, start to launch-ready. Six documents of vision, one document of
execution. **Now go write `scripts/seed.ts`.**
