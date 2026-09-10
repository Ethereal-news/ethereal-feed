import type { Category } from "../config/categories";

/** One row of the items table. */
export interface ItemRow {
  id: number;
  key: string;
  url: string;
  title: string;
  description: string;
  source_id: string;
  source_type: string;
  category: string;
  author: string | null;
  author_name: string | null;
  version: string | null;
  prerelease: number;
  published_at: string;
  fetched_at: string;
  status: string;
}

const COLS =
  "id, key, url, title, description, source_id, source_type, category, author, author_name, version, prerelease, published_at, fetched_at, status";

/** Name to show for an item's author: the display name where set, else the username. */
export function authorName(i: Pick<ItemRow, "author" | "author_name">): string | null {
  return i.author_name || i.author;
}

export interface ListOpts {
  limit?: number;
  category?: Category;
  /** Inclusive lower bound on published_at (ISO). */
  from?: string;
  /** Exclusive upper bound on published_at (ISO). */
  to?: string;
}

/** Published items, newest first. */
export async function listPublished(db: D1Database, opts: ListOpts = {}): Promise<ItemRow[]> {
  const where = ["status = 'published'"];
  const binds: unknown[] = [];
  if (opts.category) {
    where.push("category = ?");
    binds.push(opts.category);
  }
  if (opts.from) {
    where.push("published_at >= ?");
    binds.push(opts.from);
  }
  if (opts.to) {
    where.push("published_at < ?");
    binds.push(opts.to);
  }
  let sql = `SELECT ${COLS} FROM items WHERE ${where.join(" AND ")} ORDER BY published_at DESC, id DESC`;
  if (opts.limit) {
    sql += " LIMIT ?";
    binds.push(opts.limit);
  }
  const res = await db.prepare(sql).bind(...binds).all<ItemRow>();
  return res.results;
}

/** Pending items (allowlist sources awaiting review), newest first. */
export async function listPending(db: D1Database): Promise<ItemRow[]> {
  const res = await db
    .prepare(`SELECT ${COLS} FROM items WHERE status = 'pending' ORDER BY published_at DESC, id DESC`)
    .all<ItemRow>();
  return res.results;
}

/** "source_id\nauthor" -> number of pending + published topics by that author on that source. */
export async function authorTopicCounts(db: D1Database, sourceIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (sourceIds.length === 0) return out;
  const res = await db
    .prepare(
      `SELECT source_id, author, COUNT(*) AS n FROM items
       WHERE status IN ('pending', 'published') AND author IS NOT NULL
         AND source_id IN (${sourceIds.map(() => "?").join(",")})
       GROUP BY source_id, author`
    )
    .bind(...sourceIds)
    .all<{ source_id: string; author: string; n: number }>();
  for (const r of res.results) out.set(`${r.source_id}\n${r.author}`, r.n);
  return out;
}

/** Reject a pending item; returns whether a row changed. */
export async function hidePending(db: D1Database, id: number): Promise<boolean> {
  const res = await db.prepare(`UPDATE items SET status = 'hidden' WHERE id = ? AND status = 'pending'`).bind(id).run();
  return (res.meta.changes ?? 0) > 0;
}

export interface SourceCounts {
  total: number;
  last30: number;
}

export interface LatestRun {
  run_at: string;
  ok: number;
  error: string | null;
}

export interface SourceStats {
  /** Published item counts per source_id. */
  counts: Map<string, SourceCounts>;
  /** Most recent fetch_runs row per source_id. */
  latest: Map<string, LatestRun>;
  /** run_at of the most recent successful run per source_id. */
  lastOk: Map<string, string>;
  /** newsletter_links rows per source_id. */
  newsletter: Map<string, number>;
}

/** Everything the /sources table needs, in one batch. */
export async function sourceStats(db: D1Database, now = new Date()): Promise<SourceStats> {
  const since30 = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const [counts, latest, lastOk, newsletter] = await db.batch([
    db
      .prepare(
        `SELECT source_id, COUNT(*) AS total, SUM(CASE WHEN published_at >= ? THEN 1 ELSE 0 END) AS last30
         FROM items WHERE status = 'published' GROUP BY source_id`
      )
      .bind(since30),
    db.prepare(
      `SELECT source_id, run_at, ok, error FROM fetch_runs
       WHERE id IN (SELECT MAX(id) FROM fetch_runs GROUP BY source_id)`
    ),
    db.prepare(`SELECT source_id, MAX(run_at) AS run_at FROM fetch_runs WHERE ok = 1 GROUP BY source_id`),
    db.prepare(`SELECT source_id, COUNT(*) AS n FROM newsletter_links WHERE source_id IS NOT NULL GROUP BY source_id`),
  ]);

  return {
    counts: new Map(
      (counts.results as Array<{ source_id: string; total: number; last30: number }>).map((r) => [
        r.source_id,
        { total: r.total, last30: r.last30 },
      ])
    ),
    latest: new Map(
      (latest.results as Array<{ source_id: string } & LatestRun>).map((r) => [
        r.source_id,
        { run_at: r.run_at, ok: r.ok, error: r.error },
      ])
    ),
    lastOk: new Map((lastOk.results as Array<{ source_id: string; run_at: string }>).map((r) => [r.source_id, r.run_at])),
    newsletter: new Map((newsletter.results as Array<{ source_id: string; n: number }>).map((r) => [r.source_id, r.n])),
  };
}

/** For each item key, the URL of the most recent issue that linked to it. */
export async function newsletterAppearances(db: D1Database, keys: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < keys.length; i += 90) {
    const chunk = keys.slice(i, i + 90);
    const res = await db
      .prepare(
        `SELECT item_key, issue_url, issue_date FROM newsletter_links
         WHERE item_key IN (${chunk.map(() => "?").join(",")}) ORDER BY issue_date DESC`
      )
      .bind(...chunk)
      .all<{ item_key: string; issue_url: string; issue_date: string }>();
    for (const r of res.results) if (!out.has(r.item_key)) out.set(r.item_key, r.issue_url);
  }
  return out;
}
