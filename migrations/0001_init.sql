-- Migration number: 0001
-- Everything that can appear in the river.
CREATE TABLE items (
  id            INTEGER PRIMARY KEY,
  key           TEXT NOT NULL UNIQUE,           -- stable identity, dedupes; url may change
  url           TEXT NOT NULL,                  -- current link; updated on conflict
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',       -- <= 200 chars, plain text
  source_id     TEXT NOT NULL,                  -- key into config/sources.ts
  source_type   TEXT NOT NULL,                  -- rss | scraped | markdown | release | discourse
  category      TEXT NOT NULL,                  -- newsletter section slug
  author        TEXT,                           -- discourse username, etc.
  version       TEXT,                           -- releases only
  prerelease    INTEGER NOT NULL DEFAULT 0,
  published_at  TEXT NOT NULL,                  -- ISO 8601, from the source
  fetched_at    TEXT NOT NULL,                  -- ISO 8601, first seen
  status        TEXT NOT NULL DEFAULT 'published' -- published | pending | hidden
);
CREATE INDEX items_river ON items (status, published_at DESC);
CREATE INDEX items_cat   ON items (category, status, published_at DESC);
CREATE INDEX items_src   ON items (source_id, status);

-- One row per source per cron run. Powers /sources health.
CREATE TABLE fetch_runs (
  id            INTEGER PRIMARY KEY,
  run_at        TEXT NOT NULL,
  source_id     TEXT NOT NULL,
  ok            INTEGER NOT NULL,
  found         INTEGER NOT NULL DEFAULT 0,     -- items in the response after date filter
  inserted      INTEGER NOT NULL DEFAULT 0,     -- new rows
  error         TEXT,
  ms            INTEGER
);
CREATE INDEX runs_src ON fetch_runs (source_id, run_at DESC);
