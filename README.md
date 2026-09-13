# AasPaas

**Discover what's around you.** A community-powered directory of local shops,
services and places — added, verified and corrected by the people who actually use
them, not by the businesses themselves.

See `01-product-vision.md` through `07-roadmap-and-architecture.md` for the full
product/architecture/security/SDLC plan. This README only covers running the code.

## Stack

Next.js (App Router, TypeScript) &middot; Tailwind CSS &middot; shadcn/ui &middot;
MongoDB Atlas (native driver) &middot; zod &middot; Vitest

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in MONGODB_URI and JWT_ACCESS_SECRET (see below)
npm run create-indexes       # one-time per database
npm run seed                 # sample places around Habra, North 24 Parganas
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### MongoDB

You need a MongoDB Atlas cluster (the free tier is enough). Create three databases
on it — `aaspaas_dev`, `aaspaas_staging`, `aaspaas_prod` — and point `.env.local`'s
`MONGODB_URI`/`MONGODB_DB_NAME` at `aaspaas_dev` for local work. `npm run
create-indexes` and `npm run seed` both read `MONGODB_URI`/`MONGODB_DB_NAME` from
your `.env.local`.

### Auth

`JWT_ACCESS_SECRET` must be set for register/login/add-place to work — generate one
with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and
put it in `.env.local`. Without `RESEND_API_KEY` set, verification emails aren't
sent — the link is logged to the server console instead, which is enough to test
the full register → verify → login flow locally.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` / `npm start` | Production build / run |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests (Vitest) |
| `npm run format` | Prettier, writes in place |
| `npm run create-indexes` | Creates all indexes from `07-roadmap-and-architecture.md` §1.4 |
| `npm run seed` | Wipes/re-seeds `categories` + `places`; upserts 3 seed contributors in `users` (never wipes real accounts) |

Seed contributors (so every seeded place has a real `createdBy`, not `null`) log in
with `priya_habra` / `rahul_ashoknagar` / `ananya_barasat` and the password
`AasPaasSeed#2024` — dev-only, printed by the seed script, never used against
`aaspaas_prod`.

## Project layout

```
src/app/                current pages + API routes (App Router)
src/lib/auth/            password hashing, JWT, opaque tokens, session/cookies
src/lib/db/              Mongo connection singleton + per-collection accessors
src/lib/email/           transactional email (Resend, with a dev console fallback)
src/lib/rateLimit/       Mongo-backed fixed-window rate limiting
src/lib/search/          parseQuery → buildQuery → rank pipeline (see §1.6)
src/lib/validation/      zod schemas shared by scripts, API routes and forms
src/components/ui/       shadcn/ui primitives
src/components/          app-specific components (search, places, auth, layout)
src/types/domain.ts      the authoritative schema (§1.3), typed
scripts/                 seed.ts, createIndexes.ts
tests/unit/              unit tests for pure logic (search/ranking, validation, auth helpers)
tests/integration/       API routes exercised against a real mongodb-memory-server instance
```

## Status

M0 (scaffold + CI), M1 (data model, seed, read-only browse/search) and M2 (auth,
add-place flow) are done. Moderation, reputation and spam scoring land in M3–M5 —
see `07-roadmap-and-architecture.md` §4.
