import type { Env } from "../../index";
import { findByUrl, hidePublished, listStories, storyItems, type ItemRow } from "../../db/items";
import { escapeHtml as h } from "../escape";
import { htmlResponse } from "../layout";
import { age, sourceLabel } from "../render";
import { attachForm, back, urlForms } from "./pending";

/**
 * "/pending/review": add an item by hand, or hide a published one (by URL, or
 * from the newest stories). Under /pending so Cloudflare Access covers it; no-store.
 * A hidden item stays hidden across fetches; adding its URL again shows it again.
 */

/** Newest stories listed with hide buttons. */
const RECENT = 60;

function itemRow(i: ItemRow, now: Date, member: boolean): string {
  const a = age(i.published_at, now);
  return `<li${member ? ' class="member"' : ""}><a href="${h(i.url)}" rel="noopener">${h(i.title)}</a> <span class="muted">(${h(sourceLabel(i))}${member ? `, ${h(i.story_role)}` : ""}, <time datetime="${h(i.published_at)}" title="${h(i.published_at)}">${h(a.text)}</time>)</span>
<form method="post" action="/pending/review/hide"><input type="hidden" name="id" value="${i.id}"><button class="hide" type="submit">Hide</button></form></li>`;
}

export async function reviewPage(env: Env): Promise<Response> {
  const now = new Date();
  const stories = await listStories(env.DB, { limit: RECENT });

  let body = `<h1>Review</h1>
<p class="hint"><a href="/pending">Pending queue</a> · <a href="/draft">Newsletter draft</a></p>`;
  body += await attachForm(env, "/pending/review");
  body += `<section>
<h2>Hide item</h2>
<p class="hint">Takes a published link off the river and feeds. A story's primary passes that role to its next item.</p>
<form class="attach" method="post" action="/pending/review/hide">
<label>URL <input type="url" name="url" required placeholder="https://"></label>
<button class="pill" type="submit">Hide</button>
</form>
</section>
<section>
<h2>Recent <span>${stories.length} newest stories</span></h2>
<ul class="stories">
${stories.map((s) => storyItems(s).map((i, n) => itemRow(i, now, n > 0)).join("\n")).join("\n")}
</ul>
</section>`;

  return htmlResponse(env, {
    title: "Review",
    description: "Add or hide feed items.",
    path: "/pending/review",
    private: true,
    body: `<div class="pending">${body}</div>`,
  });
}

/** POST /pending/review/hide with id or url: hide that published item, then back to review. */
export async function hideItem(request: Request, env: Env): Promise<Response> {
  const form = await request.formData().catch(() => null);
  const url = String(form?.get("url") ?? "").trim();
  let id = Number(form?.get("id"));
  if (url) {
    if (!/^https?:\/\//.test(url)) return new Response("Bad URL", { status: 400 });
    const item = await findByUrl(env.DB, urlForms(url));
    if (!item) return new Response("No item with that URL", { status: 404 });
    id = item.id;
  }
  if (!Number.isInteger(id) || id <= 0) return new Response("Bad request", { status: 400 });
  if (!(await hidePublished(env.DB, id, new Date().toISOString()))) {
    return new Response("That item is not published (already hidden, or still pending).", { status: 409 });
  }
  form?.set("back", "/pending/review");
  return back(form);
}
