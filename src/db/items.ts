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
  version: string | null;
  prerelease: number;
  published_at: string;
  fetched_at: string;
  status: string;
}

const COLS =
  "id, key, url, title, description, source_id, source_type, category, author, version, prerelease, published_at, fetched_at, status";

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
}

/** Everything the /sources table needs, in one batch. */
export async function sourceStats(db: D1Database, now = new Date()): Promise<SourceStats> {
  const since30 = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const [counts, latest, lastOk] = await db.batch([
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
  };
}
