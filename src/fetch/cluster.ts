import type { Env } from "../index";
import { SOURCE_BY_ID } from "../config/sources";
import { linkForm } from "./newsletter";

/**
 * Story clustering. Runs at the end of every fetch over published items that
 * have no story yet: the rows this run inserted, rows an allowlist published
 * since, and (on the first run after migration 0006) everything. Each item
 * joins an existing story or founds its own; two existing stories are never
 * merged. Candidates are looked up by three rules, first hit wins:
 *
 *   1. Cross-link: one of the new item's outbound links is an existing
 *      item's URL, or an existing item links to the new item's URL. Both
 *      sides are compared in linkForm(), so Discourse topic links match by
 *      topic id whatever slug they carry.
 *   2. Shared token, within TOKEN_WINDOW_DAYS: a version ("v1.16.4",
 *      "0.8.30") or package-ish ("slang-solx") token appears in the new
 *      item's title or description and in an existing item's title or
 *      description, and either the two share a config `group` or the token
 *      is a version. Tokens seen in more than GENERIC_TOKEN_MAX items in the
 *      window are ignored as too generic.
 *   3. Same non-null config `group`, within GROUP_WINDOW_HOURS.
 *
 * A joining item is "more"; then the story's primary is recomputed: blog
 * post (not a bug post) > release > forum topic > other, ties to the
 * earliest published. Forum topics that are not primary are "commentary".
 *
 * A story's id is the id of the item that founded it, so stories can be
 * created inside one batch without reading ids back.
 */

/** How far back existing items are loaded as cross-link candidates. */
export const LINK_POOL_DAYS = 90;
export const TOKEN_WINDOW_DAYS = 7;
export const GROUP_WINDOW_HOURS = 72;
export const GENERIC_TOKEN_MAX = 5;

export type StoryRole = "primary" | "more" | "commentary";

export interface Row {
  id: number;
  url: string;
  title: string;
  description: string;
  source_id: string;
  source_type: string;
  status: string;
  published_at: string;
  story_id: number | null;
  story_role: string;
}

const ROW_COLS = "id, url, title, description, source_id, source_type, status, published_at, story_id, story_role";

const VERSION_RE = /\bv?\d+\.\d+(?:\.\d+)?\b/g;
const PACKAGE_RE = /\b[a-z][a-z0-9-]*-[a-z0-9-]+\b/g;

/** Version and package-ish tokens in `text`, lowercased, versions without their leading "v". */
export function tokens(text: string): Set<string> {
  const lower = text.toLowerCase();
  const out = new Set<string>();
  for (const m of lower.matchAll(VERSION_RE)) out.add(m[0].replace(/^v/, ""));
  for (const m of lower.matchAll(PACKAGE_RE)) out.add(m[0]);
  return out;
}

/** Versions lose their "v" in tokens(), so they are the tokens that start with a digit. */
export function isVersion(token: string): boolean {
  return /^\d/.test(token);
}

function groupOf(row: Row): string | undefined {
  return SOURCE_BY_ID[row.source_id]?.group;
}

function sameGroup(a: Row, b: Row): boolean {
  const g = groupOf(a);
  return g !== undefined && g === groupOf(b);
}

/** Lower is better. */
export function rank(row: Row): number {
  const kind = SOURCE_BY_ID[row.source_id]?.kind;
  if (kind === "blog" && !/\bbug\b/i.test(row.title)) return 0;
  if (row.source_type === "release") return 1;
  if (row.source_type === "discourse") return 2;
  return 3;
}

function gapMs(a: Row, b: Row): number {
  return Math.abs(new Date(a.published_at).getTime() - new Date(b.published_at).getTime());
}

/** Most recently published first, so a tie goes to the freshest story. */
function newestFirst(a: Row, b: Row): number {
  return a.published_at < b.published_at ? 1 : a.published_at > b.published_at ? -1 : b.id - a.id;
}

/** Earliest published first; ties to the lower id. */
function oldestFirst(a: Row, b: Row): number {
  return a.published_at < b.published_at ? -1 : a.published_at > b.published_at ? 1 : a.id - b.id;
}

async function selectRows(db: D1Database, where: string, binds: unknown[]): Promise<Row[]> {
  return (await db.prepare(`SELECT ${ROW_COLS} FROM items WHERE ${where}`).bind(...binds).all<Row>()).results;
}

/** outbound_links grouped by `by`, chunked to stay under D1's bind cap. */
async function loadLinks(
  db: D1Database,
  by: "item_id" | "url",
  values: Array<number | string>
): Promise<Map<number | string, Array<number | string>>> {
  const out = new Map<number | string, Array<number | string>>();
  for (let i = 0; i < values.length; i += 90) {
    const chunk = values.slice(i, i + 90);
    const res = await db
      .prepare(`SELECT item_id, url FROM outbound_links WHERE ${by} IN (${chunk.map(() => "?").join(",")})`)
      .bind(...chunk)
      .all<{ item_id: number; url: string }>();
    for (const r of res.results) {
      const [k, v] = by === "item_id" ? [r.item_id, r.url] : [r.url, r.item_id];
      out.set(k, [...(out.get(k) ?? []), v]);
    }
  }
  return out;
}

export interface ClusterResult {
  clustered: number;
  joined: number;
}

export async function clusterNew(env: Env, now = new Date().toISOString()): Promise<ClusterResult> {
  const db = env.DB;
  const fresh = await selectRows(db, "story_id IS NULL AND status = 'published' ORDER BY published_at ASC, id ASC", []);
  if (fresh.length === 0) return { clustered: 0, joined: 0 };

  // Candidate pool: published, already-clustered items back to LINK_POOL_DAYS
  // before the oldest new item. New items join the pool as they are
  // assigned, so two items from the same run can cluster with each other.
  const lo = new Date(new Date(fresh[0].published_at).getTime() - LINK_POOL_DAYS * 86_400_000).toISOString();
  const pool: Row[] = [];
  const byId = new Map<number, Row>();
  const byUrl = new Map<string, Row[]>();
  const tokenCache = new Map<number, Set<string>>();
  const tokensOf = (row: Row) => {
    let t = tokenCache.get(row.id);
    if (!t) tokenCache.set(row.id, (t = tokens(`${row.title} ${row.description}`)));
    return t;
  };
  const addToPool = (row: Row) => {
    pool.push(row);
    byId.set(row.id, row);
    const form = linkForm(row.url);
    if (form) byUrl.set(form, [...(byUrl.get(form) ?? []), row]);
  };
  for (const row of await selectRows(db, "story_id IS NOT NULL AND status = 'published' AND published_at >= ?", [lo])) {
    addToPool(row);
  }

  const outbound = await loadLinks(db, "item_id", fresh.map((r) => r.id));
  const inbound = await loadLinks(db, "url", fresh.map((r) => linkForm(r.url)).filter((f): f is string => f !== null));

  const stmts: D1PreparedStatement[] = [];
  let joined = 0;

  const rule1 = (item: Row): Row[] => {
    const out: Row[] = [];
    for (const link of outbound.get(item.id) ?? []) out.push(...(byUrl.get(String(link)) ?? []));
    const form = linkForm(item.url);
    if (form) for (const id of inbound.get(form) ?? []) {
      const row = byId.get(Number(id));
      if (row) out.push(row);
    }
    return out;
  };

  const rule2 = (item: Row): Row[] => {
    const mine = tokensOf(item);
    if (mine.size === 0) return [];
    const window = pool.filter((row) => gapMs(item, row) <= TOKEN_WINDOW_DAYS * 86_400_000);
    // Token -> how many items in the window carry it, the new item included.
    const seen = new Map<string, number>();
    for (const t of mine) seen.set(t, 1);
    for (const row of window) for (const t of tokensOf(row)) if (mine.has(t)) seen.set(t, seen.get(t)! + 1);
    const out: Row[] = [];
    for (const row of window) {
      for (const t of tokensOf(row)) {
        if (!mine.has(t) || seen.get(t)! > GENERIC_TOKEN_MAX) continue;
        if (isVersion(t) || sameGroup(item, row)) {
          out.push(row);
          break;
        }
      }
    }
    return out;
  };

  const rule3 = (item: Row): Row[] =>
    groupOf(item) === undefined
      ? []
      : pool.filter((row) => sameGroup(item, row) && gapMs(item, row) <= GROUP_WINDOW_HOURS * 3_600_000);

  /** Every item of a story: what the database has, overridden by this run's in-memory assignments. */
  const membersOf = async (storyId: number): Promise<Row[]> => {
    const members = new Map<number, Row>();
    for (const row of await selectRows(db, "story_id = ? AND status = 'published'", [storyId])) members.set(row.id, row);
    for (const row of pool) if (row.story_id === storyId) members.set(row.id, row);
    return [...members.values()];
  };

  const recomputePrimary = async (storyId: number) => {
    const members = await membersOf(storyId);
    const best = members.sort((a, b) => rank(a) - rank(b) || oldestFirst(a, b))[0];
    for (const m of members) {
      const role: StoryRole = m.id === best.id ? "primary" : m.source_type === "discourse" ? "commentary" : "more";
      if (role === m.story_role) continue;
      m.story_role = role;
      stmts.push(db.prepare("UPDATE items SET story_role = ? WHERE id = ?").bind(role, m.id));
    }
    stmts.push(db.prepare("UPDATE stories SET primary_item_id = ?, updated_at = ? WHERE id = ?").bind(best.id, now, storyId));
  };

  for (const item of fresh) {
    let candidates: Row[] = [];
    for (const rule of [rule1, rule2, rule3]) {
      candidates = rule(item).filter((row) => row.id !== item.id && row.story_id !== null);
      if (candidates.length) break;
    }
    const match = candidates.sort(newestFirst)[0];

    if (!match) {
      stmts.push(
        db.prepare("INSERT INTO stories (id, primary_item_id, created_at, updated_at) VALUES (?1, ?1, ?2, ?2)").bind(item.id, now),
        db.prepare("UPDATE items SET story_id = ?1, story_role = 'primary' WHERE id = ?1").bind(item.id)
      );
      addToPool({ ...item, story_id: item.id, story_role: "primary" });
      continue;
    }

    const storyId = match.story_id!;
    stmts.push(db.prepare("UPDATE items SET story_id = ?, story_role = 'more' WHERE id = ?").bind(storyId, item.id));
    addToPool({ ...item, story_id: storyId, story_role: "more" });
    await recomputePrimary(storyId);
    joined++;
  }

  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
  return { clustered: fresh.length, joined };
}
