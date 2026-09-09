import type { Env } from "../../index";
import { listPublished, newsletterAppearances } from "../../db/items";
import { escapeHtml as h } from "../escape";
import { describe, htmlResponse, notFound } from "../layout";
import { longDate, renderItem } from "../render";

/** Parse YYYY-MM-DD strictly; rejects impossible dates like 2026-02-30. */
export function parseDay(s: string): Date | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

function shift(date: Date, days: number): string {
  return new Date(date.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/** "/day/:date": everything published on one UTC day, with prev/next links. */
export async function dayPage(env: Env, dateStr: string): Promise<Response> {
  const day = parseDay(dateStr);
  if (!day) return notFound(env, "day");

  const now = new Date();
  const key = day.toISOString().slice(0, 10);
  const next = shift(day, 1);
  const prev = shift(day, -1);
  const items = await listPublished(env.DB, { from: day.toISOString(), to: `${next}T00:00:00.000Z` });
  const issues = await newsletterAppearances(env.DB, items.map((i) => i.key));

  const list = items.length
    ? items.map((i) => renderItem(i, now, issues)).join("\n")
    : `<p class="empty">Nothing published on this day.</p>`;

  const showNext = next <= now.toISOString().slice(0, 10);
  const pager = `<nav class="pager" aria-label="Days">
<a href="/day/${prev}" rel="prev">← ${h(longDate(prev))}</a>
${showNext ? `<a href="/day/${next}" rel="next">${h(longDate(next))} →</a>` : ""}
</nav>`;

  return htmlResponse(env, {
    title: `Ethereum news for ${longDate(key)}`,
    description: describe(`Ethereum news for ${longDate(key)}`),
    path: `/day/${key}`,
    body: `<h1>${h(longDate(key))} <span>UTC</span></h1>\n${list}\n${pager}`,
  });
}
