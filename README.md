# CowAg Quote Helper

Internal quoting tool for Cowaramup Agencies.

## Setup (local)

1. Create a [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres) database (or use an existing Neon/Postgres URL).
2. Copy env vars into `.env.local`:

```bash
cp .env.example .env.local
# Paste POSTGRES_URL from Vercel → Storage → Postgres → .env.local tab
```

3. Install and seed:

```bash
npm install
npm run db:seed:json
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Or pull production env vars with the Vercel CLI:

```bash
npx vercel link
npx vercel env pull .env.local
```

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run test` — run Vitest tests
- `npm run db:seed:json` — import CowAg catalogue from `data/cowag-catalogue-seed.json`
- `npm run db:seed` — re-parse PDF price list and import (requires Python + PDF file)

## Deploy to Vercel

Same flow as your other apps — plus a Postgres database for quotes and catalogue data.

1. Go to [vercel.com/new](https://vercel.com/new) and import `cowaramupagencies/QuoteHelper`
2. In the project, open **Storage → Create Database → Postgres** (Neon). Vercel adds `POSTGRES_URL` automatically.
3. Add these environment variables:

| Variable | Value |
|----------|--------|
| `ADMIN_PASSWORD` | Your admin password |
| `ADMIN_SESSION_SECRET` | Long random string |

4. Deploy, then seed the catalogue **once** (with env vars loaded):

```bash
npx vercel env pull .env.local
npm run db:seed:json
```

Your live app will be at something like `https://quote-helper.vercel.app`.

### GitHub Pages

[cowaramupagencies.github.io/QuoteHelper/](https://cowaramupagencies.github.io/QuoteHelper/) only shows this README. Disable GitHub Pages in repo **Settings → Pages** if you do not need a docs mirror.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md).
