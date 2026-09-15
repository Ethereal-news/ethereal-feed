import type { Env } from "../../index";
import { listPublished, newsletterAppearances } from "../../db/items";
import { escapeHtml as h } from "../escape";
import { describe, htmlResponse, notFound } from "../layout";
import { longDate, renderRiver } from "../render";
import { parseDay, shift } from "./day";

/** YYYY-MM-DD of the Saturday on or before `date` (UTC); the newsletter week runs Sat–Fri. */
export function weekStart(date: Date): string {
  const back = (date.getUTCDay() + 1) % 7; // Sat=0 ... Fri=6
  return shift(date, -back);
}

/** "/week": the current week. Redirect changes daily, so keep it out of caches. */
export function weekRedirect(): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: `/week/${weekStart(new Date())}`, "Cache-Control": "no-store" },
  });
}

/** "/week/:saturday": Sat–Fri published items with day headers, and prev/next week links. */
export async function weekPage(env: Env, dateStr: string): Promise<Response> {
  const day = parseDay(dateStr);
  if (!day) return notFound(env, "week");

  const saturday = weekStart(day);
  if (saturday !== dateStr) {
    return new Response(null, { status: 301, headers: { Location: `/week/${saturday}` } });
  }

  const now = new Date();
  const start = new Date(`${saturday}T00:00:00.000Z`);
  const next = shift(start, 7);
  const prev = shift(start, -7);
  const items = await listPublished(env.DB, { from: start.toISOString(), to: `${next}T00:00:00.000Z` });
  const issues = await newsletterAppearances(env.DB, items.map((i) => i.key));

  const showNext = next <= now.toISOString().slice(0, 10);
  const pager = `<nav class="pager" aria-label="Weeks">
<a href="/week/${prev}" rel="prev">← Week of ${h(longDate(prev))}</a>
${showNext ? `<a href="/week/${next}" rel="next">Week of ${h(longDate(next))} →</a>` : ""}
</nav>`;

  const label = `week of ${longDate(saturday)}`;
  return htmlResponse(env, {
    title: `Ethereum news for ${label}`,
    description: describe(`Ethereum news for the ${label}`),
    path: `/week/${saturday}`,
    body: `<h1>Week of ${h(longDate(saturday))} <span>Sat–Fri, UTC</span></h1>\n${renderRiver(items, now, issues)}\n${pager}`,
  });
}
