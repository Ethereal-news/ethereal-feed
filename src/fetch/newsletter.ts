import type { Env } from "../index";
import { SOURCES, siteFor, type Source } from "../config/sources";
import { parseTopicUrl } from "./discourse";
import { normalizeUrl } from "./html";
import { fetchText } from "./http";
import { parseFeed } from "./rss";

/**
 * Newsletter appearance tracking: which links each ethereal.news issue
 * carried, matched back to a source and, where we have it, an item.
 */

export const NEWSLETTER_RSS = "https://ethereal.news/rss.xml";
export const NEWSLETTER_ARCHIVE = "https://ethereal.news/archive/";
const NEWSLETTER_HOST = "ethereal.news";

export interface IssueLink {
  issue_url: string;
  issue_date: string;
  url: string;
}

export interface NewsletterRow extends IssueLink {
  source_id: string | null;
  item_key: string | null;
}

/** Markdown URL for an issue: the page URL minus its trailing slash, plus ".md". */
export function issueMarkdownUrl(issueUrl: string): string {
  return issueUrl.replace(/\/$/, "") + ".md";
}

/** Every http(s) link in an issue's markdown, normalized and deduplicated. */
export function parseIssue(markdown: string, issueUrl: string, fallbackDate?: string): IssueLink[] {
  const issue_date =
    markdown.match(/^Date:\s*(\d{4}-\d{2}-\d{2})\s*$/m)?.[1] ?? fallbackDate ?? "";
  // The exporter escapes punctuation ("\-", "\_"); undo that before matching.
  const text = markdown.replace(/\\([\\`*_{}[\]()#+\-.!|<>])/g, "$1");
  const seen = new Set<string>();
  const out: IssueLink[] = [];
  for (const m of text.matchAll(/https?:\/\/[^\s<>"'`)\]]+/g)) {
    const raw = m[0].replace(/[.,;:!?]+$/, "");
    let url: string;
    try {
      url = normalizeUrl(raw);
      if (new URL(url).host.replace(/^www\./, "") === NEWSLETTER_HOST) continue; // self links
    } catch {
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ issue_url: issueUrl, issue_date, url });
  }
  return out;
}

// ---------------------------------------------------------------- matching

interface HostRule {
  host: string;
  /** Path prefix the link must start with (shared hosts like paragraph.com). */
  prefix: string;
  source_id: string;
}

function bareHost(u: string): string {
  return new URL(u).host.toLowerCase().replace(/^www\./, "");
}

function hostRule(u: string, source_id: string): HostRule | null {
  try {
    const parsed = new URL(u);
    const prefix = parsed.pathname.replace(/\/$/, "").toLowerCase();
    return { host: bareHost(u), prefix, source_id };
  } catch {
    return null;
  }
}

let rules: { repos: Map<string, string>; hosts: HostRule[] } | null = null;

/** Lookup tables from config, built once per isolate. */
function matchRules() {
  if (rules) return rules;
  const repos = new Map<string, string>();
  const hosts: HostRule[] = [];
  for (const s of SOURCES) {
    if (s.type === "release" || s.type === "markdown") {
      repos.set(`${s.owner}/${s.repo}`.toLowerCase(), s.id);
    }
    if (s.type === "discourse") {
      hosts.push({ host: bareHost(s.url), prefix: "", source_id: s.id });
      continue;
    }
    const site = hostRule(siteFor(s), s.id);
    if (site) hosts.push(site);
    // Feed or listing host as a fallback when it differs from the site.
    const feedUrl = s.type === "rss" ? s.url : s.type === "scraped" ? s.listUrl : null;
    if (feedUrl) {
      const feed = hostRule(new URL(feedUrl).origin, s.id);
      if (feed && !hosts.some((h) => h.host === feed.host && h.source_id === s.id)) hosts.push(feed);
    }
  }
  // Longest prefix first so "paragraph.com/@ethstaker" beats a bare host rule.
  hosts.sort((a, b) => b.prefix.length - a.prefix.length);
  rules = { repos, hosts };
  return rules;
}

/** Map a link to a configured source id, or null. */
export function matchSource(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.host.toLowerCase().replace(/^www\./, "");
  const path = parsed.pathname.toLowerCase();
  const { repos, hosts } = matchRules();

  if (host === "github.com") {
    const m = path.match(/^\/([^/]+)\/([^/]+)/);
    return (m && repos.get(`${m[1]}/${m[2]}`)) || null;
  }
  for (const r of hosts) {
    if (r.host !== host) continue;
    if (!r.prefix || path === r.prefix || path.startsWith(r.prefix + "/")) return r.source_id;
  }
  return null;
}

/** Normalized url and discourse key lookups over a set of item rows. */
export interface ItemIndex {
  byUrl: Map<string, string>;
  byKey: Set<string>;
}

export function buildItemIndex(rows: Array<{ key: string; url: string }>): ItemIndex {
  const byUrl = new Map<string, string>();
  const byKey = new Set<string>();
  for (const r of rows) {
    byUrl.set(normalizeUrl(r.url), r.key);
    byKey.add(r.key);
  }
  return { byUrl, byKey };
}

/** Discourse key a forum link would have, if it is a topic link on a configured forum. */
function discourseKeyFor(url: string): string | null {
  const source_id = matchSource(url);
  const s = source_id ? (SOURCES.find((x) => x.id === source_id) as Source | undefined) : undefined;
  if (!s || s.type !== "discourse") return null;
  const topic = parseTopicUrl(url);
  return topic ? `discourse:${new URL(s.url).host}:${topic.id}` : null;
}

/** The items.key a link refers to, or null. */
export function matchItem(url: string, index: ItemIndex): string | null {
  const direct = index.byUrl.get(normalizeUrl(url));
  if (direct) return direct;
  const dk = discourseKeyFor(url);
  return dk && index.byKey.has(dk) ? dk : null;
}

/** Load just the item rows that could match these links (D1 binds are capped at 100). */
export async function loadItemIndex(db: D1Database, urls: string[]): Promise<ItemIndex> {
  const wanted = new Set<string>();
  const keys = new Set<string>();
  for (const u of urls) {
    const n = normalizeUrl(u);
    wanted.add(n);
    wanted.add(n + "/");
    const dk = discourseKeyFor(u);
    if (dk) keys.add(dk);
  }
  const rows: Array<{ key: string; url: string }> = [];
  const query = async (col: "url" | "key", values: string[]) => {
    for (let i = 0; i < values.length; i += 90) {
      const chunk = values.slice(i, i + 90);
      const res = await db
        .prepare(`SELECT key, url FROM items WHERE ${col} IN (${chunk.map(() => "?").join(",")})`)
        .bind(...chunk)
        .all<{ key: string; url: string }>();
      rows.push(...res.results);
    }
  };
  await query("url", [...wanted]);
  if (keys.size) await query("key", [...keys]);
  return buildItemIndex(rows);
}

export function toRows(links: IssueLink[], index: ItemIndex): NewsletterRow[] {
  return links.map((l) => ({ ...l, source_id: matchSource(l.url), item_key: matchItem(l.url, index) }));
}

/** Issue URLs from the RSS, newest first. */
export async function listIssues(): Promise<Array<{ url: string; date: string }>> {
  const xml = await fetchText(NEWSLETTER_RSS, { Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8" });
  return parseFeed(xml)
    .filter((e) => e.url && e.published)
    .sort((a, b) => b.published!.getTime() - a.published!.getTime())
    .map((e) => ({ url: e.url.replace(/\/?$/, "/"), date: e.published!.toISOString().slice(0, 10) }));
}

/** Fetch, parse and match one issue. */
export async function collectIssue(issue: { url: string; date: string }, db: D1Database): Promise<NewsletterRow[]> {
  const markdown = await fetchText(issueMarkdownUrl(issue.url), { Accept: "text/markdown, text/plain;q=0.9, */*;q=0.8" });
  const links = parseIssue(markdown, issue.url, issue.date);
  const index = await loadItemIndex(db, links.map((l) => l.url));
  return toRows(links, index);
}

export const INSERT_LINK =
  "INSERT OR IGNORE INTO newsletter_links (issue_url, issue_date, url, source_id, item_key) VALUES (?, ?, ?, ?, ?)";

/**
 * Record links from the newest two issues. Two rather than one so a late edit
 * to last week's issue is still picked up. Called at the end of each cron run.
 */
export async function checkLatestIssues(env: Env): Promise<void> {
  const issues = (await listIssues()).slice(0, 2);
  for (const issue of issues) {
    const rows = await collectIssue(issue, env.DB);
    if (rows.length === 0) continue;
    const stmt = env.DB.prepare(INSERT_LINK);
    await env.DB.batch(rows.map((r) => stmt.bind(r.issue_url, r.issue_date, r.url, r.source_id, r.item_key)));
  }
}
