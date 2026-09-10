import type { Env } from "../index";
import { SOURCES, type Source } from "../config/sources";
import { checkLatestIssues } from "./newsletter";

/** What every fetcher returns; run.ts turns these into rows. */
export interface RawItem {
  key: string;
  url: string;
  title: string;
  description?: string;
  /** Username for discourse (allowlists match on it), otherwise whatever the feed gives. */
  author?: string;
  /** Display name where the forum has one; shown in place of `author`. */
  author_name?: string;
  version?: string;
  prerelease?: boolean;
  published_at: string; // ISO
}

/** Items older than this at first sight are stored hidden (guards against archive re-emits). */
export const MAX_AGE_DAYS = 14;

/** Gap between requests to the same rate-limited host. */
const SAME_HOST_GAP_MS = 1_500;

/**
 * Where a source's request goes, for grouping. Substack subdomains share one
 * rate limiter, so they collapse to one key. GitHub is token-authenticated and
 * happy with concurrency, so it is left ungrouped.
 */
function fetchHost(source: Source): string | null {
  switch (source.type) {
    case "rss": {
      const host = new URL(source.url).host;
      return host.endsWith(".substack.com") ? "substack.com" : host;
    }
    case "scraped":   return new URL(source.listUrl).host;
    case "discourse": return new URL(source.url).host;
    case "release":
    case "markdown":  return null;
  }
}

type RunResult = { source: Source; found: number; inserted: number; ms: number };

export async function runFetch(env: Env): Promise<void> {
  const runAt = new Date().toISOString();
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 86_400_000);

  const one = async (source: Source): Promise<RunResult> => {
    const started = Date.now();
    const items = await fetchSource(source, env);
    const fresh = items.filter((i) => new Date(i.published_at) >= cutoff);
    const inserted = await upsertItems(env, source, fresh, runAt);
    return { source, found: fresh.length, inserted, ms: Date.now() - started };
  };

  // Sources sharing a host run one after another with a gap; everything else in parallel.
  const byHost = new Map<string, Source[]>();
  for (const s of SOURCES) {
    const host = fetchHost(s);
    if (host) byHost.set(host, [...(byHost.get(host) ?? []), s]);
  }
  const settled = new Map<Source, PromiseSettledResult<RunResult>>();
  const lanes: Promise<void>[] = [];
  const settle = (source: Source, p: Promise<RunResult>) =>
    p.then(
      (value) => void settled.set(source, { status: "fulfilled", value }),
      (reason) => void settled.set(source, { status: "rejected", reason })
    );
  for (const s of SOURCES) {
    const host = fetchHost(s);
    const group = host ? byHost.get(host)! : [s];
    if (group.length === 1) {
      lanes.push(settle(s, one(s)));
    } else if (group[0] === s) {
      lanes.push(
        (async () => {
          for (const [i, member] of group.entries()) {
            if (i > 0) await new Promise((r) => setTimeout(r, SAME_HOST_GAP_MS));
            await settle(member, one(member));
          }
        })()
      );
    }
  }
  await Promise.all(lanes);
  await publishTrusted(env);
  await enforceFilters(env);
  const results = SOURCES.map((s) => settled.get(s)!);

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

  // Newsletter appearances are best-effort; never let them fail the run.
  try {
    await checkLatestIssues(env);
  } catch (e) {
    console.error("newsletter check failed:", e instanceof Error ? e.message : e);
  }
}

/**
 * Allowlists are retroactive: pending rows whose author has since been added
 * to trustedAuthors publish on the next run instead of staying stuck.
 */
async function publishTrusted(env: Env): Promise<void> {
  const stmts = SOURCES.flatMap((s) => {
    if (s.trust !== "allowlist" || s.type !== "discourse" || s.trustedAuthors.length === 0) return [];
    const marks = s.trustedAuthors.map(() => "?").join(",");
    return [
      env.DB.prepare(
        `UPDATE items SET status = 'published' WHERE status = 'pending' AND source_id = ? AND author IN (${marks})`
      ).bind(s.id, ...s.trustedAuthors),
    ];
  });
  if (stmts.length) await env.DB.batch(stmts);
}

/**
 * Filters are retroactive too: published rows that no longer pass their
 * source's filter (rows inserted before the filter existed, or before it was
 * tightened) are hidden on every run. Release sources match tagFilter against
 * the tag read back from the key (`release:owner/repo:tag`); RSS sources match
 * titleFilter against the title. D1 has no REGEXP and caps LIKE pattern
 * length, so the match is done here and the ids are hidden in one batch.
 */
export async function enforceFilters(env: Env): Promise<number> {
  const sources = SOURCES.filter(
    (s) => (s.type === "release" && s.tagFilter) || (s.type === "rss" && s.titleFilter)
  );
  if (sources.length === 0) return 0;

  const marks = sources.map(() => "?").join(",");
  const rows = await env.DB.prepare(
    `SELECT id, key, title, source_id FROM items WHERE status = 'published' AND source_id IN (${marks})`
  ).bind(...sources.map((s) => s.id)).all<{ id: number; key: string; title: string; source_id: string }>();

  const ids: number[] = [];
  for (const row of rows.results) {
    const source = sources.find((s) => s.id === row.source_id);
    if (!source) continue;
    if (source.type === "release" && source.tagFilter) {
      const prefix = `release:${source.owner}/${source.repo}:`;
      const tag = row.key.startsWith(prefix) ? row.key.slice(prefix.length) : row.key;
      if (!source.tagFilter.test(tag)) ids.push(row.id);
    } else if (source.type === "rss" && source.titleFilter) {
      if (!source.titleFilter.test(row.title)) ids.push(row.id);
    }
  }
  if (ids.length === 0) return 0;

  const stmts: D1PreparedStatement[] = [];
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    stmts.push(
      env.DB.prepare(
        `UPDATE items SET status = 'hidden' WHERE id IN (${chunk.map(() => "?").join(",")})`
      ).bind(...chunk)
    );
  }
  await env.DB.batch(stmts);
  console.log(`filters: hid ${ids.length} row(s)`);
  return ids.length;
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
    INSERT INTO items (key, url, title, description, source_id, source_type, category, author, author_name, version, prerelease, published_at, fetched_at, status)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
    ON CONFLICT(key) DO UPDATE SET
      url = excluded.url, title = excluded.title,
      description = excluded.description, author = excluded.author, author_name = excluded.author_name
  `);
  await env.DB.batch(
    items.map((i) =>
      stmt.bind(
        i.key, i.url, i.title, (i.description ?? "").slice(0, 200),
        source.id, source.type, source.category, i.author ?? null, i.author_name ?? null, i.version ?? null,
        i.prerelease ? 1 : 0, i.published_at, fetchedAt, statusFor(source, i)
      )
    )
  );
  return inserted;
}
