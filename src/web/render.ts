import { CATEGORY_NAME, isCategory } from "../config/categories";
import { MANUAL_SOURCE_ID, SOURCE_BY_ID, siteFor } from "../config/sources";
import { authorName, storyItems, type ItemRow, type Story } from "../db/items";
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

/** Host of a hand-attached item's link, without "www.". */
function manualHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Config name for the source; the link's host for hand-attached items; the raw id when removed from config. */
export function sourceLabel(item: Pick<ItemRow, "source_id" | "url">): string {
  if (item.source_id === MANUAL_SOURCE_ID) return manualHost(item.url);
  return SOURCE_BY_ID[item.source_id]?.name ?? item.source_id;
}

/** Source line: name linking to the source's site, then " · kind" unless it is a blog. */
export function sourceLine(item: Pick<ItemRow, "source_id" | "url">): string {
  const s = SOURCE_BY_ID[item.source_id];
  if (!s) return h(sourceLabel(item));
  const link = `<a href="${h(siteFor(s))}" target="_blank" rel="noopener">${h(s.name)}</a>`;
  return s.kind === "blog" ? link : `${link} · ${h(s.kind)}`;
}

export function categoryName(slug: string): string {
  return isCategory(slug) ? CATEGORY_NAME[slug] : slug;
}

/** item key -> most recent newsletter issue URL that linked to it. */
export type IssueMap = Map<string, string>;

/**
 * Label for a newsletter issue from its URL slug: ".../ethereal-news-weekly-33/" -> "weekly #33",
 * ".../ethereal-news-mini-2/" -> "mini #2". Falls back to "issue" for anything else.
 */
export function issueLabel(url: string): string {
  const m = url.match(/ethereal-news-([a-z]+)-(\d+)\/?$/);
  return m ? `${m[1]} #${m[2]}` : "issue";
}

/**
 * One river entry:
 *   source            (muted, text-xs)
 *   title             (links out)
 *   summary           (one clamped line, body colour at 80%, only if non-empty)
 *   category · author · age · "in weekly #33"   (muted, text-xs, tracked)
 */
export function renderItem(item: ItemRow, now: Date, issue?: string, extra = ""): string {
  const meta = [
    `<a href="/c/${h(item.category)}">${h(categoryName(item.category))}</a>`,
    authorName(item) ? h(authorName(item)!) : "",
    `<time datetime="${h(item.published_at)}" title="${h(item.published_at)}">${h(age(item.published_at, now).text)}</time>`,
    issue ? `<a class="issue" href="${h(issue)}" rel="noopener" title="Linked from an Ethereal news issue">in ${h(issueLabel(issue))}</a>` : "",
  ].filter(Boolean);
  const desc = item.description ? `\n<div class="d">${h(item.description)}</div>` : "";
  return `<article class="item">
<div class="s">${sourceLine(item)}</div>
<div class="t"><a href="${h(item.url)}" rel="noopener">${h(item.title)}</a></div>${desc}
<div class="m">${meta.join(" · ")}</div>${extra}
</article>`;
}

/** "Title (Source) · Title (Source)" for a story's secondary items. */
function storyLinks(items: ItemRow[]): string {
  return items
    .map((i) => `<a href="${h(i.url)}" rel="noopener">${h(i.title)}</a> (${h(sourceLabel(i))})`)
    .join(" · ");
}

/** The most recent issue that linked to any item of the story, shown on the primary. */
export function storyIssue(story: Story, issues?: IssueMap): string | undefined {
  if (!issues) return undefined;
  for (const i of storyItems(story)) {
    const url = issues.get(i.key);
    if (url) return url;
  }
  return undefined;
}

/**
 * A story: the primary exactly as an item renders, then muted "More:" and
 * "Commentary:" lines listing the other items when there are any.
 */
export function renderStory(story: Story, now: Date, issues?: IssueMap): string {
  const lines = [
    story.more.length ? `\n<div class="more"><span class="lbl">More:</span> ${storyLinks(story.more)}</div>` : "",
    story.commentary.length ? `\n<div class="more"><span class="lbl">Commentary:</span> ${storyLinks(story.commentary)}</div>` : "",
  ].join("");
  return renderItem(story.primary, now, storyIssue(story, issues), lines);
}

/** Stories in order, with a running date header each time the primary's UTC day changes. */
export function renderRiver(stories: Story[], now: Date, issues?: IssueMap): string {
  if (stories.length === 0) return `<p class="empty">Nothing here yet.</p>`;
  let out = "";
  let current = "";
  for (const story of stories) {
    const key = dayKey(story.primary.published_at);
    if (key !== current) {
      current = key;
      out += `<h2 class="day"><a href="/day/${h(key)}">${h(dayLabel(key, now))}</a></h2>\n`;
    }
    out += renderStory(story, now, issues) + "\n";
  }
  return out;
}

/** Keys of every item in every story, for the newsletter lookup. */
export function storyKeys(stories: Story[]): string[] {
  return stories.flatMap((s) => storyItems(s).map((i) => i.key));
}
