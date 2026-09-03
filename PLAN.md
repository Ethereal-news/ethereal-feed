# feed.ethereal.news — build plan (steps 1 & 2)

Single Cloudflare Worker (Workers Paid, $5/mo) + D1 + one cron. Primary sources only,
config-driven, no admin panel, no AI. EIP/ERC/RIP numbering is a separate tool,
local for now (§10); if it later publishes an RSS feed, the feed ingests it as one
more source.

---

## 1. Project layout

```
ethereal-feed/
  wrangler.jsonc
  package.json
  migrations/
    0001_init.sql
  src/
    index.ts              # exports { fetch, scheduled }
    config/
      sources.ts          # the source list (blogs, repos, discourse, sheet)
      categories.ts       # newsletter section order
      site.ts             # name, domain, colours
    fetch/
      run.ts              # scheduled(): iterate sources, upsert items, record run
      rss.ts              # RSS/Atom feeds            (from blog-posts.ts)
      scraped.ts          # HTML listing pages        (from blog-posts.ts SCRAPED_BLOGS)
      github-releases.ts  # client + dev tool releases (from github.ts, client-releases.ts, dev-tool-releases.ts)
      discourse.ts        # ethresear.ch, magicians   (from eth-research.ts)
      html.ts             # stripHtml, truncate, normalizeUrl helpers
    db/
      items.ts            # typed D1 queries
      runs.ts
    web/
      router.ts           # tiny path matcher (or Hono)
      layout.ts           # shell: header, theme toggle, footer
      pages/
        river.ts          # /
        category.ts       # /c/:slug
        day.ts            # /day/:date
        sources.ts        # /sources
        draft.ts          # /draft?since=
        pending.ts        # /pending
      feeds.ts            # feed.xml, feed.json, /c/:slug/feed.xml
      styles.ts           # CSS string, matches ethereal.news palette
```

Dependencies: `fast-xml-parser` (already used), optionally `hono` for routing. Nothing else.
Drop `better-sqlite3`, `next`, `react`, the `execSync curl` fallback.

---

## 2. wrangler.jsonc

```jsonc
{
  "name": "ethereal-feed",
  "main": "src/index.ts",
  "compatibility_date": "2026-09-01",
  "routes": [{ "pattern": "feed.ethereal.news", "custom_domain": true }],
  "triggers": { "crons": ["*/30 * * * *"] },
  "d1_databases": [
    { "binding": "DB", "database_name": "ethereal-feed", "database_id": "<from wrangler d1 create>" }
  ],
  "vars": { "SITE_URL": "https://feed.ethereal.news" },
  "observability": { "enabled": true }
}
```

Secrets (`wrangler secret put`): `GITHUB_TOKEN` (fine-grained, public repo read only).

Cloudflare Access (Zero Trust, free): one application covering
`feed.ethereal.news/pending*`, policy = your email. Everything else is public.

Paid-plan limits that matter: cron gets 30 s CPU and up to 1000 subrequests per run.
Current fetcher is ~80 requests. Comfortable.

---

## 3. D1 schema (`migrations/0001_init.sql`)

```sql
-- Everything that can appear in the river.
CREATE TABLE items (
  id            INTEGER PRIMARY KEY,
  key           TEXT NOT NULL UNIQUE,          -- stable identity, see below
  url           TEXT NOT NULL,                 -- current link; updated on conflict
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',      -- <= 200 chars, plain text
  source_id     TEXT NOT NULL,                 -- key into sources.ts
  source_type   TEXT NOT NULL,                 -- blog | release | discourse
  category      TEXT NOT NULL,                 -- newsletter section slug
  author        TEXT,                          -- discourse dc:creator, PR author
  version       TEXT,                          -- releases only
  prerelease    INTEGER NOT NULL DEFAULT 0,
  published_at  TEXT NOT NULL,                 -- ISO, from the source
  fetched_at    TEXT NOT NULL,                 -- ISO, first seen
  status        TEXT NOT NULL DEFAULT 'published'  -- published | pending | hidden
);
CREATE INDEX items_river ON items (status, published_at DESC);
CREATE INDEX items_cat   ON items (category, status, published_at DESC);
CREATE INDEX items_src   ON items (source_id, status);

-- One row per source per cron run. Powers /sources health and lets you spot dead feeds.
CREATE TABLE fetch_runs (
  id            INTEGER PRIMARY KEY,
  run_at        TEXT NOT NULL,
  source_id     TEXT NOT NULL,
  ok            INTEGER NOT NULL,
  found         INTEGER NOT NULL DEFAULT 0,    -- items in the response
  inserted      INTEGER NOT NULL DEFAULT 0,    -- new items
  error         TEXT,
  ms            INTEGER
);
CREATE INDEX runs_src ON fetch_runs (source_id, run_at DESC);
```

`key` is what dedupes, not `url`, because URLs move (Discourse slugs are regenerated
when a title is edited; some blogs change permalinks). Per source type:

| type | key | url stored |
|---|---|---|
| discourse | `discourse:<host>:<topic_id>` | `https://<host>/t/<topic_id>` (slug-free, redirects to the current slug) |
| release | `release:<owner>/<repo>:<tag>` | release page |
| rss / scraped | `rss:<source_id>:<guid>` if the feed has a stable `<guid>`/`<id>`, else the normalized URL | entry link |

Insert is `INSERT ... ON CONFLICT(key) DO UPDATE SET url = excluded.url, title = excluded.title`,
so a renamed topic keeps its one row and its original `published_at`.

Deliberately not in v1: a `stories`/`links` table for commentary. Adding
`story_links(item_id, related_item_id, role)` later is a one-line migration and
nothing in v1 needs to change.

---

## 4. `sources.ts` shape

```ts
export type Trust = "auto" | "allowlist";

export type Source =
  | { id: string; name: string; type: "rss";      url: string; category: Category; trust: Trust;
      rewriteUrl?: (u: string) => string }
  | { id: string; name: string; type: "scraped";  listUrl: string; baseUrl: string; category: Category;
      trust: Trust; parse: (html: string) => RawItem[] }
  | { id: string; name: string; type: "release";  owner: string; repo: string; category: Category;
      trust: Trust; includePrerelease?: boolean }          // clients: Staking, consensus-specs: Layer 1, tools: Developers
  | { id: string; name: string; type: "discourse"; url: string; category: Category; trust: "allowlist";
      trustedAuthors: string[]; excludeCategories?: string[] };

export const SOURCES: Source[] = [
  /* ported from BLOG_FEEDS, SCRAPED_BLOGS, CLIENTS, DEV_TOOLS, DISCOURSE_FEEDS */
];
```

Rules encoded in the fetcher, not per-source:

- `auto` → `status = 'published'` on insert.
- `allowlist` → `published` if `author` is in `trustedAuthors`, else `pending`.
- Prereleases: stored, `hidden` by default unless `includePrerelease`.
- Items older than 14 days at first sight are `hidden` (protects against a feed that
  re-emits its whole archive after a rebuild).
- Newsletter category slugs come from `categories.ts` in section order:
  `ecosystem, enterprise, applications, developers, security, layer-1, staking, layer-2, regulation, general`.
  (Research items from ethresear.ch map to Layer 1 for the river; keep a `research`
  slug only if you want a separate page.)

---

## 5. Fetcher port — what changes

| Existing | Change |
|---|---|
| `fetchRss` with `execSync` fallback | plain `fetch` with `AbortSignal.timeout(10_000)` |
| `better-sqlite3` `INSERT OR IGNORE` on `url` | `env.DB.batch()` of `INSERT ... ON CONFLICT(key) DO UPDATE` (url, title) |
| 7-day lookback filter | keep, but widen to 14 days; dedupe by `url` makes re-seeing harmless |
| `issue-checker.ts`, `eips.ts`, `ercs.ts` | drop (numbering moves to §10) |
| `Promise.all` over all sources | `Promise.allSettled`, record one `fetch_runs` row per source |
| `getDefaultCategory` by source_type | category comes from `sources.ts` |
| Discourse: `normalizeDiscourseUrl` strips the slug | keep, and also extract the topic id into `key`; add `author` from `dc:creator`; per-category RSS `/c/<slug>/<id>.rss` if you want to drop e.g. off-topic categories |


---

## 6. Routes

| Path | What |
|---|---|
| `/` | river: newest 100 published items, grouped under running date headers |
| `/c/:slug` | same, filtered to a category |
| `/day/:yyyy-mm-dd` | everything published that day, permanent |
| `/sources` | table: source, category, published item count (all-time and 30d), last ok fetch, last error |
| `/pending` | **Access** — allowlist items awaiting an author approval (approve = edit `sources.ts`) |
| `/draft?since=YYYY-MM-DD` | newsletter markdown: `### Section` headers in section order, `- [Title](url) — desc` per item |
| `/feed.xml`, `/feed.json` | full river (last 50) |
| `/c/:slug/feed.xml` | per-category |
| `/health` | last cron run time + count of sources with errors (for an uptime pinger) |

Caching: `Cache-Control: public, max-age=300` on public pages and feeds; `no-store` on
`/pending`. Optionally `caches.default` in the Worker keyed on path, purged at end
of each cron run.


---

## 7. Look and feel

Match ethereal.news: `#fafafa` / `#171717` backgrounds, black/white text, system
font stack, light/dark/system toggle with `localStorage.theme` (same key as the main
site so preference carries over). Header: "Ethereal news" wordmark → "feed", nav for
categories, RSS icon, theme toggle.

River item (Techmeme density):

```
Sep 3 ─────────────────────────────────────────
  Geth v1.16.4                                                 ← headline, links out
  Layer 1 · Geth (EL) · 2h                                     ← muted line
  Fixes a regression in snap sync introduced in 1.16.3.       ← description if present, 1 line, clamp

  EIP-8408: Frame Transaction
  Layer 1 · EIP · abcoathup · 5h
```

No images, no ranking, no top-story box. Mobile is a single column of the same.

---

## 8. Tasks

### Step 1 — river live
1. `wrangler init`, D1 create, apply migration 0001.
2. Port `sources.ts` from the four existing lists; every entry gets `id`, `category`, `trust`.
3. Port fetchers (rss, scraped, github-releases, discourse) per §5; `run.ts` with `allSettled` + `fetch_runs`.
4. `scheduled()` wired; test locally with `wrangler dev --test-scheduled` and `curl "/__scheduled?cron=*/30+*+*+*+*"`.
5. Layout + river page + `/day` + `/c/:slug`.
6. `feed.xml` / `feed.json` / per-category feeds.
7. Custom domain `feed.ethereal.news`, deploy, let it run 24 h, check `/sources` counts against the old tool's output.

Done when: the river shows the last week of `auto` sources correctly categorised and RSS validates.

### Step 2
8. `/sources` health table, `/draft` view.
9. Discourse allowlist + `/pending`.

### Later
10. If the local EIP numbering tool grows an RSS output, add it to `sources.ts` as an `rss` source. Nothing else in the feed changes.

---

## 9. Ops notes

- GitHub: fine-grained token, public-repo read, 5000 req/h. Worst case per run ≈ 150 requests. Set `User-Agent`.
- No retries on cron: a failed run is a 30-min gap. `/health` + a free uptime pinger (Cloudflare's own health checks or any external one) if you want to know.
- Backups: `wrangler d1 export` weekly via a GitHub Action, or rely on D1 Time Travel (30-day point-in-time restore on paid).
- Removing a source: delete it from `sources.ts`; existing items stay (history), `/sources` shows it as inactive.

---

## 10. EIP numbering: separate, local for now

Out of scope for the feed. Keep the number-assignment sheet as the source of truth
and build a local script/tool around it when useful (unnumbered `c-new` PR queue,
next number, self-assignment warnings, Forkcast link lookup). The one design
decision that keeps the door open: if that tool ever emits RSS with one item per
numbered EIP/ERC/RIP and a stable per-EIP link, the feed picks it up with a single
`sources.ts` entry and no schema change.
