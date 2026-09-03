import type { Env } from "../index";
import { SOURCES, type Source } from "../config/sources";

/** What every fetcher returns; run.ts turns these into rows. */
export interface RawItem {
  key: string;
  url: string;
  title: string;
  description?: string;
  author?: string;
  version?: string;
  prerelease?: boolean;
  published_at: string; // ISO
}

/** Items older than this at first sight are stored hidden (guards against archive re-emits). */
const MAX_AGE_DAYS = 14;

export async function runFetch(env: Env): Promise<void> {
  const runAt = new Date().toISOString();
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 86_400_000);

  const results = await Promise.allSettled(
    SOURCES.map(async (source) => {
      const started = Date.now();
      const items = await fetchSource(source, env);
      const fresh = items.filter((i) => new Date(i.published_at) >= cutoff);
      const inserted = await upsertItems(env, source, fresh, runAt);
      return { source, found: fresh.length, inserted, ms: Date.now() - started };
    })
  );

  const runRows = results.map((r, i) => {
    const source = SOURCES[i];
    if (r.status === "fulfilled") {
      return env.DB.prepare(
        "INSERT INTO fetch_runs (run_at, source_id, ok, found, inserted, ms) VALUES (?, ?, 1, ?, ?, ?)"
      ).bind(runAt, source.id, r.value.found, r.value.inserted, r.value.ms);
    }
    const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
    return env.DB.prepare(
      "INSERT INTO fetch_runs (run_at, source_id, ok, error) VALUES (?, ?, 0, ?)"
    ).bind(runAt, source.id, msg.slice(0, 500));
  });
  await env.DB.batch(runRows);
}

async function fetchSource(source: Source, env: Env): Promise<RawItem[]> {
  switch (source.type) {
    case "rss":       return (await import("./rss")).fetchRss(source);
    case "scraped":   return (await import("./scraped")).fetchScraped(source);
    case "markdown":  return (await import("./markdown")).fetchMarkdown(source, env);
    case "release":   return (await import("./github-releases")).fetchReleases(source, env);
    case "discourse": return (await import("./discourse")).fetchDiscourse(source);
  }
}

function statusFor(source: Source, item: RawItem): "published" | "pending" | "hidden" {
  if (item.prerelease && !(source.type === "release" && source.includePrerelease)) return "hidden";
  if (source.trust === "allowlist") {
    const ok = source.type === "discourse" && item.author && source.trustedAuthors.includes(item.author);
    return ok ? "published" : "pending";
  }
  return "published";
}

async function upsertItems(env: Env, source: Source, items: RawItem[], fetchedAt: string): Promise<number> {
  if (items.length === 0) return 0;

  // Count genuinely new keys before upserting; an upsert can't report insert vs update.
  const keys = items.map((i) => i.key);
  const existing = await env.DB.prepare(
    `SELECT key FROM items WHERE key IN (${keys.map(() => "?").join(",")})`
  ).bind(...keys).all<{ key: string }>();
  const known = new Set(existing.results.map((r) => r.key));
  const inserted = keys.filter((k) => !known.has(k)).length;

  const stmt = env.DB.prepare(`
    INSERT INTO items (key, url, title, description, source_id, source_type, category, author, version, prerelease, published_at, fetched_at, status)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
    ON CONFLICT(key) DO UPDATE SET url = excluded.url, title = excluded.title
  `);
  await env.DB.batch(
    items.map((i) =>
      stmt.bind(
        i.key, i.url, i.title, (i.description ?? "").slice(0, 200),
        source.id, source.type, source.category, i.author ?? null, i.version ?? null,
        i.prerelease ? 1 : 0, i.published_at, fetchedAt, statusFor(source, i)
      )
    )
  );
  return inserted;
}
