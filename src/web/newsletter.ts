import { NEWSLETTER_RSS } from "../fetch/newsletter";
import { cleanDescription, parseFeed } from "../fetch/rss";
import { USER_AGENT } from "../fetch/http";
import { escapeHtml as h } from "./escape";
import { age, issueLabel } from "./render";

/**
 * The latest Ethereal news issue, shown in the river as an entry of its own on
 * the day it was published, with a subscribe link in place of a category.
 */

export const SUBSCRIBE_URL = "https://etherealnews.substack.com/subscribe?utm_source=feed.ethereal.news";

export interface LatestIssue {
  url: string;
  title: string;
  description: string;
  published_at: string;
}

/** How long one isolate reuses the issue before looking again. */
const MEMO_MS = 15 * 60_000;
/** Page renders wait at most this long for ethereal.news; on timeout we fall back to D1. */
const FETCH_TIMEOUT_MS = 2_000;

let memo: { at: number; issue: LatestIssue | null } | null = null;

/** Newest issue from ethereal.news/rss.xml (edge cached), or null on any failure. */
async function fromRss(): Promise<LatestIssue | null> {
  try {
    const res = await fetch(NEWSLETTER_RSS, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/xml;q=0.9" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cf: { cacheTtl: 900, cacheEverything: true },
    });
    if (!res.ok) return null;
    const newest = parseFeed(await res.text())
      .filter((e) => e.published && e.url && e.title)
      .sort((a, b) => b.published!.getTime() - a.published!.getTime())[0];
    if (!newest) return null;
    return {
      url: newest.url,
      title: newest.title,
      description: cleanDescription(newest.description),
      published_at: newest.published!.toISOString(),
    };
  } catch {
    return null;
  }
}

/** Newest issue the cron has already recorded; no description. */
async function fromDb(db: D1Database): Promise<LatestIssue | null> {
  const row = await db
    .prepare(`SELECT issue_url, issue_date FROM newsletter_links ORDER BY issue_date DESC LIMIT 1`)
    .first<{ issue_url: string; issue_date: string }>();
  if (!row) return null;
  return {
    url: row.issue_url,
    title: `Ethereal news ${issueLabel(row.issue_url)}`,
    description: "",
    published_at: `${row.issue_date}T00:00:00.000Z`,
  };
}

export async function latestIssue(db: D1Database): Promise<LatestIssue | null> {
  if (memo && Date.now() - memo.at < MEMO_MS) return memo.issue;
  let issue = await fromRss();
  if (!issue) {
    try {
      issue = await fromDb(db);
    } catch {
      issue = null;
    }
  }
  memo = { at: Date.now(), issue };
  return issue;
}

/**
 * Rendered like any river entry (source, title, summary, meta) so it reads as
 * part of the feed:
 *   Ethereal news · newsletter
 *   Ethereal news weekly #42
 *   Sepolia testnet upgraded to Glamsterdam, ...
 *   Subscribe free · weekly · 3d
 */
export function renderIssueEntry(issue: LatestIssue, now: Date): string {
  const desc = issue.description ? `\n<div class="d">${h(issue.description)}</div>` : "";
  return `<article class="item house">
<div class="s"><a href="https://ethereal.news" rel="noopener">Ethereal news</a> · newsletter</div>
<div class="t"><a href="${h(issue.url)}" rel="noopener">${h(issue.title)}</a></div>${desc}
<div class="m"><a class="sub" href="${h(SUBSCRIBE_URL)}" rel="noopener">Subscribe free</a> · weekly · <time datetime="${h(issue.published_at)}" title="${h(issue.published_at)}">${h(age(issue.published_at, now).text)}</time></div>
</article>`;
}
