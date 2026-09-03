import { CATEGORY_NAME, isCategory } from "../config/categories";
import { SOURCE_BY_ID } from "../config/sources";
import type { ItemRow } from "../db/items";
import { escapeHtml as h } from "./escape";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

/** Short relative age: now, 5m, 2h, 3d, else the date. */
export function relativeTime(iso: string, now: Date): string {
  const ms = now.getTime() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days < 14) return `${days}d`;
  return dayLabel(dayKey(iso), now);
}

/** What the muted line calls the source: release label, config name, or the raw id. */
export function sourceLabel(item: Pick<ItemRow, "source_id">): string {
  const s = SOURCE_BY_ID[item.source_id];
  if (!s) return item.source_id;
  return s.type === "release" && s.label ? s.label : s.name;
}

export function categoryName(slug: string): string {
  return isCategory(slug) ? CATEGORY_NAME[slug] : slug;
}

export function renderItem(item: ItemRow, now: Date): string {
  const meta = [
    `<a href="/c/${h(item.category)}">${h(categoryName(item.category))}</a>`,
    h(sourceLabel(item)),
    item.author ? h(item.author) : "",
    `<time datetime="${h(item.published_at)}" title="${h(item.published_at)}">${h(relativeTime(item.published_at, now))}</time>`,
  ].filter(Boolean);
  const desc = item.description ? `<div class="d">${h(item.description)}</div>` : "";
  return `<article class="item">
<div class="t"><a href="${h(item.url)}" rel="noopener">${h(item.title)}</a></div>
<div class="m">${meta.join(" · ")}</div>
${desc}</article>`;
}

/** Items in order, with a running date header each time the UTC day changes. */
export function renderRiver(items: ItemRow[], now: Date): string {
  if (items.length === 0) return `<p class="empty">Nothing here yet.</p>`;
  let out = "";
  let current = "";
  for (const item of items) {
    const key = dayKey(item.published_at);
    if (key !== current) {
      current = key;
      out += `<h2 class="day"><a href="/day/${h(key)}">${h(dayLabel(key, now))}</a></h2>\n`;
    }
    out += renderItem(item, now) + "\n";
  }
  return out;
}
