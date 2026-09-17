import type { Env } from "../../index";
import { MANUAL_SOURCE_ID, SOURCE_BY_ID, siteFor, type DiscourseSource } from "../../config/sources";
import {
  authorTopicCounts, findByUrl, hidePending, joinStory, listPending, multiItemStories, newStory, recentStories,
  type ItemRow, type Story,
} from "../../db/items";
import { decodeEntities, truncate } from "../../fetch/html";
import { fetchText } from "../../fetch/http";
import { linkForm, matchForm } from "../../fetch/newsletter";
import { escapeHtml as h } from "../escape";
import { htmlResponse } from "../layout";
import { age, sourceLabel } from "../render";

/**
 * "/pending": the review queue for allowlist sources, plus the story tools
 * (attach a URL to a story; split an item out of one). Unlisted; no-store.
 * Approving an author is copy the snippet -> sources.ts -> push; the next
 * fetch run publishes their pending topics retroactively (see run.ts).
 */

/** Stories offered in the attach form's select. */
const ATTACH_CHOICES = 30;
/** Multi-item stories listed with split buttons. */
const SPLIT_LIST = 30;
/** Longest title taken from an attached page. */
const MAX_TITLE = 140;


/** Ready-to-paste trustedAuthors literal: current names, then the pending page's new ones marked. */
function snippet(source: DiscourseSource | undefined, pendingAuthors: string[]): string {
  const current = source?.trustedAuthors ?? [];
  const have = new Set(current.map((a) => a.toLowerCase()));
  const fresh = pendingAuthors.filter((a) => !have.has(a.toLowerCase()));
  const lines: string[] = ["trustedAuthors: ["];
  // Wrap the existing names the way sources.ts does, several per line.
  let line = "";
  for (const a of current) {
    const piece = `${JSON.stringify(a)}, `;
    if (line.length + piece.length > 76) {
      lines.push(`  ${line.trimEnd()}`);
      line = "";
    }
    line += piece;
  }
  if (line) lines.push(`  ${line.trimEnd()}`);
  const body = lines.map(h);
  for (const a of fresh) body.push(`  <span class="new">${h(JSON.stringify(a))},</span> // new`);
  body.push("],");
  return body.join("\n");
}

function row(item: ItemRow, now: Date, count: number): string {
  const a = age(item.published_at, now);
  const author = item.author_name && item.author_name !== item.author
    ? `${h(item.author_name)} <span class="muted">${h(item.author ?? "")}</span>`
    : h(item.author ?? "");
  return `<tr>
<td class="t"><a href="${h(item.url)}" rel="noopener">${h(item.title)}</a></td>
<td class="a">${author}</td>
<td class="n" title="Topics by this author, pending and published">${count}</td>
<td><time datetime="${h(item.published_at)}" title="${h(item.published_at)}">${h(a.text)}</time></td>
<td><form method="post" action="/pending/hide"><input type="hidden" name="id" value="${item.id}"><button class="hide" type="submit">Hide</button></form></td>
</tr>`;
}

export async function pendingPage(env: Env): Promise<Response> {
  const now = new Date();
  const items = await listPending(env.DB);
  const sourceIds = [...new Set(items.map((i) => i.source_id))];
  const counts = await authorTopicCounts(env.DB, sourceIds);

  // Group by source, keeping the newest-first order of first appearance.
  const groups = new Map<string, ItemRow[]>();
  for (const i of items) (groups.get(i.source_id) ?? groups.set(i.source_id, []).get(i.source_id)!).push(i);

  let body = `<h1>Pending <span>${items.length} to review</span></h1>
<p class="hint"><a href="/draft">Newsletter draft</a>: published items since last week, grouped by section.</p>`;
  if (items.length === 0) body += `<p class="empty">Nothing waiting for review.</p>`;

  for (const [sourceId, list] of groups) {
    const source = SOURCE_BY_ID[sourceId];
    const discourse = source?.type === "discourse" ? source : undefined;
    const authors = [...new Set(list.map((i) => i.author).filter((a): a is string => !!a))];
    const site = source ? siteFor(source) : undefined;
    const name = source ? h(source.name) : h(sourceId);
    body += `<section>
<h2>${site ? `<a href="${h(site)}" rel="noopener">${name}</a>` : name} <span>${list.length}</span></h2>
<p class="hint">Paste over the source's trustedAuthors in sources.ts; names in red are not yet trusted.</p>
<pre>${snippet(discourse, authors)}</pre>
<div class="tablewrap"><table>
<thead><tr><th>Topic</th><th>Author</th><th class="n" title="Topics by this author, pending and published">Topics</th><th>Age</th><th></th></tr></thead>
<tbody>
${list.map((i) => row(i, now, counts.get(`${i.source_id}\n${i.author}`) ?? 0)).join("\n")}
</tbody></table></div>
</section>`;
  }

  body += await storyTools(env);

  return htmlResponse(env, {
    title: "Pending",
    description: "Review queue for allowlist sources.",
    path: "/pending",
    private: true,
    body: `<div class="pending">${body}</div>`,
  });
}

/** The attach form and the list of multi-item stories with split buttons. */
async function storyTools(env: Env): Promise<string> {
  const choices = await recentStories(env.DB, ATTACH_CHOICES);
  const stories = await multiItemStories(env.DB, SPLIT_LIST);

  const options = choices.map((c) => `<option value="${c.id}">${h(c.title)}</option>`).join("\n");
  const form = `<section>
<h2>Attach URL to story</h2>
<p class="hint">Adds the link as a "more" or "commentary" item of the chosen story. A link already in the feed is moved rather than duplicated; anything else becomes a hand-added item, titled as given or from the page's title tag (sites like X may refuse that fetch).</p>
<form class="attach" method="post" action="/pending/attach">
<label>URL <input type="url" name="url" required placeholder="https://"></label>
<label>Title <input type="text" name="title" maxlength="${MAX_TITLE}" placeholder="from the page if empty"></label>
<label>Story <select name="story" required>${options}</select></label>
<label>Role <select name="role"><option value="more">more</option><option value="commentary">commentary</option></select></label>
<button class="pill" type="submit">Attach</button>
</form>
</section>`;

  const splitRow = (i: ItemRow) => `<li><a href="${h(i.url)}" rel="noopener">${h(i.title)}</a> <span class="muted">(${h(sourceLabel(i))}, ${h(i.story_role)})</span>
<form method="post" action="/pending/split"><input type="hidden" name="id" value="${i.id}"><button class="hide" type="submit" title="Move this item into its own story">Split</button></form></li>`;
  const storyBlock = (s: Story) => `<li><a href="${h(s.primary.url)}" rel="noopener">${h(s.primary.title)}</a> <span class="muted">(${h(sourceLabel(s.primary))})</span>
<ul>
${[...s.more, ...s.commentary].map(splitRow).join("\n")}
</ul></li>`;
  const list = `<section>
<h2>Stories <span>${stories.length} with more than one item</span></h2>
<p class="hint">Split moves an item into its own story, for when clustering got it wrong.</p>
${stories.length ? `<ul class="stories">\n${stories.map(storyBlock).join("\n")}\n</ul>` : `<p class="empty">No multi-item stories yet.</p>`}
</section>`;

  return form + list;
}

function back(): Response {
  return new Response(null, { status: 303, headers: { Location: "/pending", "Cache-Control": "no-store" } });
}

/** The page's <title>, or the URL itself when the page cannot be fetched or has none. */
async function fetchTitle(url: string): Promise<string> {
  try {
    const html = await fetchText(url, { Accept: "text/html" });
    const raw = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
    const title = decodeEntities(raw.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
    // Some pages (X posts) put the whole body in <title>; keep it to a headline.
    return title ? truncate(title, MAX_TITLE) : url;
  } catch {
    return url;
  }
}

/** Spellings a stored URL might have for this link: with and without "www." and a trailing slash. */
function urlForms(url: string): string[] {
  const n = matchForm(url);
  const www = n.replace(/^(https?:\/\/)/, "$1www.");
  return [n, `${n}/`, www, `${www}/`];
}

/**
 * POST /pending/attach with url, story, role and optional title: put the
 * link in the story. An existing item with that URL is moved (its primary
 * cannot be taken from a story that still has other items); otherwise a
 * "manual" item is created in the primary's category, titled as given or
 * from the page.
 */
export async function attachToStory(request: Request, env: Env): Promise<Response> {
  const form = await request.formData().catch(() => null);
  const url = String(form?.get("url") ?? "").trim();
  const storyId = Number(form?.get("story"));
  const role = String(form?.get("role") ?? "");
  const given = String(form?.get("title") ?? "").replace(/\s+/g, " ").trim();
  if (!/^https?:\/\//.test(url) || !linkForm(url)) return new Response("Bad URL", { status: 400 });
  if (!Number.isInteger(storyId) || storyId <= 0) return new Response("Bad story", { status: 400 });
  if (role !== "more" && role !== "commentary") return new Response("Bad role", { status: 400 });

  const story = await env.DB.prepare(
    "SELECT s.id, i.category FROM stories s JOIN items i ON i.id = s.primary_item_id WHERE s.id = ?"
  ).bind(storyId).first<{ id: number; category: string }>();
  if (!story) return new Response("No such story", { status: 404 });

  const now = new Date().toISOString();
  const existing = await findByUrl(env.DB, urlForms(url));
  if (existing) {
    if (existing.story_role === "primary" && existing.story_id !== null) {
      const others = await env.DB.prepare("SELECT COUNT(*) AS n FROM items WHERE story_id = ? AND id != ?")
        .bind(existing.story_id, existing.id).first<{ n: number }>();
      if ((others?.n ?? 0) > 0) {
        return new Response("That link is the primary of a story that still has other items; split those out first.", { status: 409 });
      }
    }
    await joinStory(env.DB, existing.id, story.id, role, now);
    if (existing.status !== "published") {
      await env.DB.prepare("UPDATE items SET status = 'published' WHERE id = ?").bind(existing.id).run();
    }
    return back();
  }

  const title = given ? truncate(given, MAX_TITLE) : await fetchTitle(url);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO items (key, url, title, description, source_id, source_type, category, published_at, fetched_at, status, story_id, story_role)
       VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, 'published', ?, ?)
       ON CONFLICT(key) DO UPDATE SET story_id = excluded.story_id, story_role = excluded.story_role, status = 'published'`
    ).bind(`manual:${linkForm(url)}`, url, title, MANUAL_SOURCE_ID, MANUAL_SOURCE_ID, story.category, now, now, story.id, role),
    env.DB.prepare("UPDATE stories SET updated_at = ? WHERE id = ?").bind(now, story.id),
  ]);
  return back();
}

/** POST /pending/split with id: move a non-primary item into a story of its own. */
export async function splitFromStory(request: Request, env: Env): Promise<Response> {
  const form = await request.formData().catch(() => null);
  const id = Number(form?.get("id"));
  if (!Number.isInteger(id) || id <= 0) return new Response("Bad request", { status: 400 });
  const item = await env.DB.prepare("SELECT story_role FROM items WHERE id = ?").bind(id).first<{ story_role: string }>();
  if (!item) return new Response("No such item", { status: 404 });
  if (item.story_role === "primary") return new Response("That item is already its story's primary.", { status: 409 });
  await newStory(env.DB, id, new Date().toISOString());
  return back();
}

/** POST /pending/hide with form field id: mark a pending item hidden, then back to the queue. */
export async function hidePendingItem(request: Request, env: Env): Promise<Response> {
  const form = await request.formData().catch(() => null);
  const id = Number(form?.get("id"));
  if (!Number.isInteger(id) || id <= 0) return new Response("Bad request", { status: 400 });
  await hidePending(env.DB, id);
  return new Response(null, { status: 303, headers: { Location: "/pending", "Cache-Control": "no-store" } });
}
