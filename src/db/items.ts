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
  /** Story this item belongs to; NULL only between insert and the run's cluster pass. */
  story_id: number | null;
  /** primary | more | commentary; see fetch/cluster.ts. */
  story_role: string;
}

const COLS =
  "id, key, url, title, description, source_id, source_type, category, author, author_name, version, prerelease, published_at, fetched_at, status, story_id, story_role";

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

/** A story: the item to headline plus the rest, each group oldest first. */
export interface Story {
  id: number | null;
  primary: ItemRow;
  more: ItemRow[];
  commentary: ItemRow[];
}

/** Every item of a story, primary first. */
export function storyItems(s: Story): ItemRow[] {
  return [s.primary, ...s.more, ...s.commentary];
}

/**
 * Published stories, newest first by the primary item's published_at, with
 * the same filters as listPublished applied to the primary. An item the
 * cluster pass has not reached yet (story_id NULL) shows as its own story.
 */
export async function listStories(db: D1Database, opts: ListOpts = {}): Promise<Story[]> {
  const where = ["status = 'published'", "(story_role = 'primary' OR story_id IS NULL)"];
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
  const primaries = (await db.prepare(sql).bind(...binds).all<ItemRow>()).results;
  const stories = primaries.map<Story>((p) => ({ id: p.story_id, primary: p, more: [], commentary: [] }));

  const byStory = new Map(stories.filter((s) => s.id !== null).map((s) => [s.id!, s]));
  const ids = [...byStory.keys()];
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const res = await db
      .prepare(
        `SELECT ${COLS} FROM items WHERE status = 'published' AND story_role != 'primary'
         AND story_id IN (${chunk.map(() => "?").join(",")}) ORDER BY published_at ASC, id ASC`
      )
      .bind(...chunk)
      .all<ItemRow>();
    for (const row of res.results) {
      const s = byStory.get(row.story_id!)!;
      (row.story_role === "commentary" ? s.commentary : s.more).push(row);
    }
  }
  return stories;
}

/** Stories with more than one published item, newest first by primary; for the split list. */
export async function multiItemStories(db: D1Database, limit: number): Promise<Story[]> {
  const res = await db
    .prepare(
      `SELECT ${COLS} FROM items WHERE status = 'published' AND story_id IN (
         SELECT story_id FROM items WHERE status = 'published' AND story_id IS NOT NULL
         GROUP BY story_id HAVING COUNT(*) > 1)
       ORDER BY story_id, story_role != 'primary', published_at ASC, id ASC`
    )
    .all<ItemRow>();
  const byStory = new Map<number, Story>();
  for (const row of res.results) {
    const id = row.story_id!;
    if (row.story_role === "primary") {
      byStory.set(id, { id, primary: row, more: [], commentary: [] });
      continue;
    }
    const story = byStory.get(id);
    if (story) (row.story_role === "commentary" ? story.commentary : story.more).push(row);
  }
  return [...byStory.values()]
    .sort((a, b) => (a.primary.published_at < b.primary.published_at ? 1 : -1))
    .slice(0, limit);
}

/** An item whose stored URL is `url` in any of the spellings we compare (www., trailing slash). */
export async function findByUrl(db: D1Database, forms: string[]): Promise<ItemRow | null> {
  const res = await db
    .prepare(`SELECT ${COLS} FROM items WHERE url IN (${forms.map(() => "?").join(",")}) ORDER BY id LIMIT 1`)
    .bind(...forms)
    .all<ItemRow>();
  return res.results[0] ?? null;
}

/** The newest stories, for the attach form: id and primary title. */
export async function recentStories(db: D1Database, limit: number): Promise<Array<{ id: number; title: string }>> {
  const res = await db
    .prepare(
      `SELECT s.id, i.title FROM stories s JOIN items i ON i.id = s.primary_item_id
       WHERE i.status = 'published' ORDER BY i.published_at DESC, s.id DESC LIMIT ?`
    )
    .bind(limit)
    .all<{ id: number; title: string }>();
  return res.results;
}

/** Create a story with `itemId` as its only member; returns the story id. */
export async function newStory(db: D1Database, itemId: number, now: string): Promise<number> {
  const row = await db
    .prepare("INSERT INTO stories (primary_item_id, created_at, updated_at) VALUES (?, ?, ?) RETURNING id")
    .bind(itemId, now, now)
    .first<{ id: number }>();
  const id = row!.id;
  await db.prepare("UPDATE items SET story_id = ?, story_role = 'primary' WHERE id = ?").bind(id, itemId).run();
  return id;
}

/** Move an item into a story with a role, dropping its old story when nothing is left in it. */
export async function joinStory(
  db: D1Database,
  itemId: number,
  storyId: number,
  role: "more" | "commentary",
  now: string
): Promise<void> {
  const old = await db.prepare("SELECT story_id FROM items WHERE id = ?").bind(itemId).first<{ story_id: number | null }>();
  const stmts = [
    db.prepare("UPDATE items SET story_id = ?, story_role = ? WHERE id = ?").bind(storyId, role, itemId),
    db.prepare("UPDATE stories SET updated_at = ? WHERE id = ?").bind(now, storyId),
  ];
  if (old?.story_id && old.story_id !== storyId) {
    stmts.push(
      db.prepare("DELETE FROM stories WHERE id = ? AND NOT EXISTS (SELECT 1 FROM items WHERE story_id = ? AND id != ?)")
        .bind(old.story_id, old.story_id, itemId)
    );
  }
  await db.batch(stmts);
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
