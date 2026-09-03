import { CATEGORY_NAME, isCategory } from "../config/categories";
import { SOURCE_BY_ID, siteFor } from "../config/sources";
import type { ItemRow } from "../db/items";
import { escapeHtml as h } from "./escape";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Ages up to this many days are shown relatively ("5d"); older ones as a date. */
const RELATIVE_DAYS = 7;

/** YYYY-MM-DD in UTC. */
export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** "Sep 3", or "Sep 3, 2025" when the year differs from `now`'s. */
export function dayLabel(key: string, now: Date): string {
  const [y, m, d] = key.split("-").map(Number);
  const label = `${MONTHS[m - 1]} ${d}`;
  return y === now.getUTCFullYear() ? label : `${label}, ${y}`;
}

/** "Sep 3, 2026" for page titles. */
export function longDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** Relative age ("now", "5m", "2h", "3d") up to 7 days, then the date ("Aug 20"). */
export function age(iso: string, now: Date): { text: string; relative: boolean } {
  const ms = now.getTime() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return { text: "now", relative: true };
  if (min < 60) return { text: `${min}m`, relative: true };
  const hrs = Math.round(min / 60);
  if (hrs < 24) return { text: `${hrs}h`, relative: true };
  const days = Math.round(hrs / 24);
  if (days <= RELATIVE_DAYS) return { text: `${days}d`, relative: true };
  return { text: dayLabel(dayKey(iso), now), relative: false };
}

export function relativeTime(iso: string, now: Date): string {
  return age(iso, now).text;
}

/** Config name for the source, or the raw id when it has been removed from config. */
export function sourceLabel(item: Pick<ItemRow, "source_id">): string {
  return SOURCE_BY_ID[item.source_id]?.name ?? item.source_id;
}

/** Source line: name linking to the source's site, then " · kind" unless it is a blog. */
export function sourceLine(item: Pick<ItemRow, "source_id">): string {
  const s = SOURCE_BY_ID[item.source_id];
  if (!s) return h(item.source_id);
  const link = `<a href="${h(siteFor(s))}" target="_blank" rel="noopener">${h(s.name)}</a>`;
  return s.kind === "blog" ? link : `${link} · ${h(s.kind)}`;
}

export function categoryName(slug: string): string {
  return isCategory(slug) ? CATEGORY_NAME[slug] : slug;
}

/** item key -> most recent newsletter issue URL that linked to it. */
export type IssueMap = Map<string, string>;

/**
 * One river entry:
 *   source            (muted, text-xs)
 *   title             (links out)
 *   summary           (one clamped line, body colour at 80%, only if non-empty)
 *   category · author · age · "in issue"   (muted, text-xs, tracked)
 */
export function renderItem(item: ItemRow, now: Date, issues?: IssueMap): string {
  const issue = issues?.get(item.key);
  const meta = [
    `<a href="/c/${h(item.category)}">${h(categoryName(item.category))}</a>`,
    item.author ? h(item.author) : "",
    `<time datetime="${h(item.published_at)}" title="${h(item.published_at)}">${h(age(item.published_at, now).text)}</time>`,
    issue ? `<a class="issue" href="${h(issue)}" rel="noopener" title="Linked from an Ethereal news issue">in issue</a>` : "",
  ].filter(Boolean);
  const desc = item.description ? `\n<div class="d">${h(item.description)}</div>` : "";
  return `<article class="item">
<div class="s">${sourceLine(item)}</div>
<div class="t"><a href="${h(item.url)}" rel="noopener">${h(item.title)}</a></div>${desc}
<div class="m">${meta.join(" · ")}</div>
</article>`;
}

/** Items in order, with a running date header each time the UTC day changes. */
export function renderRiver(items: ItemRow[], now: Date, issues?: IssueMap): string {
  if (items.length === 0) return `<p class="empty">Nothing here yet.</p>`;
  let out = "";
  let current = "";
  for (const item of items) {
    const key = dayKey(item.published_at);
    if (key !== current) {
      current = key;
      out += `<h2 class="day"><a href="/day/${h(key)}">${h(dayLabel(key, now))}</a></h2>\n`;
    }
    out += renderItem(item, now, issues) + "\n";
  }
  return out;
}
