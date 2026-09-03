# ethereal-feed

Techmeme-style river of primary Ethereum sources at feed.ethereal.news.
One Cloudflare Worker, one D1 database, one cron. See `PLAN.md`.

## Setup

```
npm install
npx wrangler login
npx wrangler d1 create ethereal-feed        # paste the id into wrangler.jsonc
npm run db:migrate:local
cp .dev.vars.example .dev.vars              # add GITHUB_TOKEN
npm run dev                                  # http://localhost:8787
npm run cron:local                           # trigger the scheduled handler once
```

## Deploy

```
npm run db:migrate
npx wrangler secret put GITHUB_TOKEN
npm run deploy
```

Uncomment the `routes` line in `wrangler.jsonc` to attach feed.ethereal.news.

## Sources

Edit `src/config/sources.ts` and deploy.
