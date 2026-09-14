# 08. Hardening pass — pre-launch audit (M6)

This is the output of M6, not another plan — a walk through every mitigation
`07-roadmap-and-architecture.md` §2 promised, confirming what's actually true of
the shipped code as of the M5 merge, fixing what wasn't, and writing down what's
knowingly deferred. Where a fix was needed, it happened in the same commit that
added this document — see the M6 commit for the diff.

---

## 1. Section 2 threat-table checklist

| # | Threat | Status | Notes |
|---|---|---|---|
| 1 | Fake/duplicate places | ✅ | `lib/trust/duplicateDetection.ts`, called from `POST /api/places` before creation. Candidate query was unbounded — **fixed**: capped at 500 candidates (a locality would need to be extraordinarily dense to hit this; it's a defensive ceiling, not an expected size). |
| 2 | Sockpuppets / self-voting | ✅ (was ⚠️) | Unique `(placeId, userId)` index ✅. Daily caps ✅ (M5). "Email verification required before votes/reports count" was **never actually implemented** — `POST /api/places/[id]/useful` and `POST /api/places/[id]/report` only checked "is there a session," not "is it verified." **Fixed**: both now 403 with a clear message for an unverified account, checked from the JWT's `emailVerified` claim (safe here — that claim only ever goes false→true, so a stale token can under-claim, never over-claim, unlike moderation roles which can be revoked). New tests: `useful-votes-api.test.ts`, `reports-api.test.ts`. |
| 3 | DB scraping | ✅ (was ⚠️) | Search/browse page size capped at `MAX_PAGE_SIZE` ✅. Per-IP 60/min on `/api/search` and `/api/places` ✅ (M5). No bulk-export endpoint ✅. ObjectIds non-sequential ✅ (Mongo default). Two *other* unpaginated public queries were found during this audit and **fixed**: the `/u/[username]` profile's place list and `GET /api/places/[id]/edits`'s edit history both now cap at 50, matching the stated page-size policy. |
| 4 | Stored XSS via name/description/photos | ✅ (text) / N/A (photos) | Grepped the whole `src/` tree for `dangerouslySetInnerHTML` — zero uses. Every place field renders through plain JSX text interpolation, which React escapes by default. Photo upload (`lib/storage/upload.ts`, Cloudinary) was never built — explicitly out of scope through M5 per review.md's Part 17 — so the photo half of this mitigation has nothing to audit yet; revisit when that phase starts. |
| 5 | IDOR on edit/report/vote endpoints | ✅ (equivalent, different shape) | The architecture named one shared `assertCanAccess(resource, user)` helper; what actually shipped is per-route inline checks instead (self-vote block in the useful-vote route; edit/report endpoints intentionally have no ownership gate at all, since anyone proposing a correction or filing a report on *any* place is the intended community-moderation model, not a bug). Audited every mutating route: none derive a target resource from anything but a server-side lookup by the URL's own id, and none trust a client-supplied id for anything but "which document to look up." No actual IDOR found. The single-helper pattern is a reasonable refactor if the number of ownership-sensitive routes grows, but isn't a correctness gap today. |
| 6 | Auth weaknesses | ✅ | bcrypt cost 12 (`lib/auth/password.ts`) ✅. Access JWT 15 min, httpOnly, `SameSite=Lax` ✅. Refresh token opaque, hashed at rest, rotated on every use ✅ (`POST /api/auth/refresh`). Email-verification tokens: 32-byte random, hashed, 24h TTL, single-use (consumed on verify) ✅. |
| 7 | Abuse via volume | ✅ | Full §2.1 tier set wired in M5 — see §2 below for the one interpretation call it required. |
| 8 | Bad input reaching the DB | ✅ | Every route that reads a JSON body validates it with a zod `safeParse` before touching anything — audited all 11 body-reading routes, zero gaps. Every query-param route (`/api/search`, `/api/places` GET) goes through `searchQuerySchema`. Dynamic route params (`[id]`, `[username]`) aren't zod objects (there's only ever one field), but every mutating route checks `ObjectId.isValid(id)` before using it, which is the right-sized validation for a single path segment. |
| 9 | Moderation privilege escalation | ✅ | `assertModerator()` re-fetches the user from the DB on every call — audited all six `/api/moderation/*` routes (queue, approve, reject, edits decision, reports resolve, watchlist), all six call it, none trust the JWT's roles claim. Every decision (including the M5 watchlist dismiss/remove) writes to `moderation_actions`. |
| 10 | PII exposure | ✅ | Registration collects exactly displayName/username/email/password — no phone/DOB/address for the *contributor* (a place's own business phone is a different, non-personal field). Grepped every API-facing serializer and route for `.email` — the only two hits are `toUserProfile` (used solely by `GET /api/users/me`, the user's own profile) and the registration/login flows' own responses to the account holder. `PlaceSummary`/`PlaceDetail`/`PublicProfile` carry no email and no raw lat/lng (`PlaceDetail.mapQuery` is text-only — see its own doc comment from M2). |
| 11 | Secrets leakage | ⚠️ → ✅ | **Found a real one**: `.env.example` held a live MongoDB Atlas connection string (username + password), byte-identical to the real `.env.local`. `.gitignore`'s blanket `.env*` meant it was never actually committed — confirmed with `git ls-files` / `git log --all -- .env.example` — so there's no leaked commit to purge from history. But the file existing at all with a real secret in it was a live landmine (the whole point of a `.env.example` is that it's the file people paste around, screenshot, or eventually `git add -f`). **Fixed**: rewrote it with placeholders only, and added `!.env.example` to `.gitignore` so it's *actually* tracked going forward, matching what the README already told people to `cp`. **Recommended**: rotate the Atlas password (`NUP3nXKenxOpj1AZ`) as a precaution — it was never in git, but it's been sitting in a plaintext file, and rotating a cluster password is cheap while a hypothetical future leak is not. See §7 below for the Vercel side of this row. |
| 12 | Supply-chain drift | ⚠️ → ✅ | `package-lock.json` was already committed ✅. `npm audit --audit-level=high` reports **0 vulnerabilities** right now. Neither an `npm audit` CI step nor a Dependabot config existed — **fixed**: added an audit step to `.github/workflows/ci.yml` (high/critical only; moderate-and-below is usually unfixable transitive-dev noise that trains you to ignore the step) and `.github/dependabot.yml` for both the npm and github-actions ecosystems, weekly. |

## 2. Rate-limit tiers — status

All of §2.1 is wired (M5): 3/10/25 daily place-submission tiers, 10 edits/20
votes/5 reports per day, 60/min anonymous reads on search+browse, 5/15min login.

One interpretation call, unchanged since M5 and re-confirmed here: §2.1 only gives
numbers for the bottom tier ("Unverified / <7 days old") and the top tier
("Trusted Contributor+"). The middle tier ("Verified, Local Explorer+") is read as
the literal complement of the bottom tier's two red flags — verified AND ≥7 days
old — rather than a strict `reputationLevel` gate, because no milestone through M5
actually computes reputation levels (every account is still `newcomer`; this was a
deliberate call in M4 against fake gamification, not an oversight). The
`reputationLevel`-gated top tier is real code, not a stub — it'll simply start
selecting real users once a future milestone computes levels honestly.

**"Tune rate limits based on real usage"** — this item can't actually be done yet.
There is no real usage; the numbers in §2.1 are the roadmap's original estimates,
unchanged. The honest thing to do is say so rather than invent traffic data: revisit
every limit in `lib/rateLimit/tiers.ts` and the login/register limits after the
first real cohort of students has used the app for a week or two, using Atlas's
own query/connection metrics and application logs (nothing bespoke needs building
for this — `console.error`/`console.log` already fire on every 429 and every
rejected/watchlisted submission, which is enough to spot a limit that's obviously
too tight or too loose).

## 3. Informal load test of `/api/search`

Local machine, production build (`next start`), a single-node local MongoDB
(no replica set, no Atlas network hop), 3,080 places (80 real seed + 3,000
synthetic, spread across 6 localities and every category, to make the text
index and compound filters do real work instead of scanning a token dataset).
`autocannon`, 20 concurrent connections, spread across randomized source IPs so
the per-IP rate limiter wasn't what was actually being measured.

| Endpoint | Median | p97.5 | p99 | Avg req/sec |
|---|---|---|---|---|
| `GET /api/search?q=mobile+habra` | 37 ms | 84 ms | 106 ms | ~486 |
| `GET /api/places?locality=Habra&limit=20` | 54 ms | 103 ms | 121 ms | ~344 |

Both comfortably clear M1's own DONE-WHEN bar ("`<500ms` locally"), with real
concurrency and 40x the current seed dataset. Separately confirmed the 60/min
per-IP limiter actually holds under concurrent load from a single IP: a 20-connection
run against one address returned exactly 60 `2xx` responses and rejected the other
~17,000 with `429`s in the same window — enforcement doesn't leak under
contention.

This is "informal" exactly as M6 asks — one machine, one dev's laptop, no
staging environment, no real Atlas network latency. It answers "does the query
plan itself scale reasonably," not "what will 100 concurrent students on
Vercel + Atlas free tier actually feel." That second question only has a real
answer after the first real week of usage (see §2's rate-limit note above —
same honesty rule applies here).

## 4. PII surfaces — confirmed locality only

Audited every serializer in `lib/db/serialize.ts` and every route response
shape. `PlaceSummary`, `PlaceDetail`, and `PublicProfile` never carry email or
raw coordinates; `UserProfile` (which does carry email) is only ever returned
from `GET /api/users/me` and login/register — a user seeing their own email is
not a PII exposure. No route was found returning a raw Mongo document via
spread (`{...doc}`) anywhere — every response is built field-by-field.

## 5. Vercel env-var scoping — a checklist, not a verified fact

This one genuinely can't be confirmed from the repo — it's a property of the
Vercel *project dashboard*, not the code. What the code side already gets
right, and what to check by hand before launch:

- [x] `.env.local` is gitignored, never committed (confirmed: `git ls-files` shows nothing under `.env*` except `.env.example`).
- [x] `.env.example` now holds placeholders only (fixed in this pass — see §1 row 11).
- [ ] **Check in the Vercel dashboard**: `MONGODB_URI`/`MONGODB_DB_NAME` are set per-environment (Development → `aaspaas_dev`, Preview → `aaspaas_staging`, Production → `aaspaas_prod`), not one value shared across all three — per §3's SDLC section, this was always the intent, but only the dashboard itself can confirm it's actually configured that way.
- [ ] **Check**: `JWT_ACCESS_SECRET` differs between staging and production (a shared secret means a staging-issued token would authenticate against production).
- [ ] **Check**: `RESEND_API_KEY`/`EMAIL_FROM` are only set where you actually want real emails sent (e.g., not in every preview deploy, unless you're fine with preview branches emailing real students).
- [ ] **Check**: the Atlas database users backing each environment are least-privilege (a Preview/Development connection string should not hold write access to `aaspaas_prod`, even if it currently happens to point elsewhere).

## 6. Atlas backup/export plan

No paid Atlas tier is assumed here — this is the free-tier-compatible plan:

- **Continuous backup**: not available on the M0 (free) tier. If/when the
  cluster upgrades to a paid tier before or shortly after launch, turn on
  Atlas's built-in Cloud Backup (continuous, point-in-time restore) — it's a
  dashboard toggle, no application change needed.
- **Until then — manual export, weekly**: `mongodump --uri="$MONGODB_URI"
  --archive=aaspaas-prod-$(date +%F).gz --gzip` run by hand (or a cheap cron
  somewhere you already control — a GitHub Actions scheduled workflow with
  the production URI as a repo secret works well and costs nothing) against
  `aaspaas_prod` specifically, never dev/staging. Keep the last 4-6 weekly
  archives; delete older ones — this is a "recover from an oops," not a
  compliance retention policy.
- **Restore path**: `mongorestore --uri="$MONGODB_URI" --archive=<file>
  --gzip` into a **new, empty** database first, sanity-check it, then only
  point the app at it — never restore directly over a live `aaspaas_prod`
  without a fresh export of the *current* (possibly-broken) state first, in
  case the restore itself needs undoing.
- **What actually needs backing up**: everything — this is a small directory,
  not a data warehouse, and `mongodump` on the whole database is cheap at
  this scale. No table is excluded.
- **Trigger for reconsidering this plan**: real data volume or a real
  incident, whichever comes first. A weekly manual export is exactly right
  for ~100 students and a few hundred places; it stops being right long
  before this app would need a second engineer.

## 7. What this pass did *not* do, on purpose

- **Did not build the shared `assertCanAccess` helper** named in §2's IDOR
  row — see §1 row 5. The protective outcome is already there; refactoring
  five call sites into one helper with no behavior change is exactly the
  kind of change to make when the *next* ownership-sensitive route is added,
  not speculatively now.
- **Did not implement `reputationLevel` computation** to fully "real-ize" the
  rate-limit tiers — this was already explicitly deferred in M4 for good
  reason (no formula exists anywhere in the planning docs) and M6 is a
  hardening pass, not a new-feature milestone. Noted again here so it doesn't
  get lost.
- **Did not add photo-upload XSS mitigations** — there's no photo upload
  feature yet to mitigate anything on.
- **Did not "tune" rate limits with real numbers** — see §2. There's no real
  traffic yet to tune against; inventing tuning would be exactly the kind of
  fabricated confidence this project has consistently avoided.
