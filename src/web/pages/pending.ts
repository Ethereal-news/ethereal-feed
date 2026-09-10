import type { Env } from "../../index";
import { SOURCE_BY_ID, siteFor, type DiscourseSource } from "../../config/sources";
import { authorTopicCounts, hidePending, listPending, type ItemRow } from "../../db/items";
import { escapeHtml as h } from "../escape";
import { htmlResponse } from "../layout";
import { age } from "../render";

/**
 * "/pending": the review queue for allowlist sources. Unlisted; no-store.
 * Approving an author is copy the snippet -> sources.ts -> push; the next
 * fetch run publishes their pending topics retroactively (see run.ts).
 */

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

  let body = `<h1>Pending <span>${items.length} to review</span></h1>`;
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

  return htmlResponse(env, {
    title: "Pending",
    description: "Review queue for allowlist sources.",
    path: "/pending",
    private: true,
    body: `<div class="pending">${body}</div>`,
  });
}

/** POST /pending/hide with form field id: mark a pending item hidden, then back to the queue. */
export async function hidePendingItem(request: Request, env: Env): Promise<Response> {
  const form = await request.formData().catch(() => null);
  const id = Number(form?.get("id"));
  if (!Number.isInteger(id) || id <= 0) return new Response("Bad request", { status: 400 });
  await hidePending(env.DB, id);
  return new Response(null, { status: 303, headers: { Location: "/pending", "Cache-Control": "no-store" } });
}
