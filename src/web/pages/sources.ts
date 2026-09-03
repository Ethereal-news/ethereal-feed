import type { Env } from "../../index";
import { CATEGORY_NAME } from "../../config/categories";
import { SOURCES, siteFor, type Kind } from "../../config/sources";
import { sourceStats } from "../../db/items";
import { escapeHtml as h } from "../escape";
import { htmlResponse } from "../layout";
import { age } from "../render";

/** Display order for kinds. */
const KIND_ORDER: Kind[] = [
  "execution layer client",
  "consensus layer client",
  "developer tool",
  "blog",
  "forum",
];

function timeCell(iso: string | undefined, now: Date): string {
  if (!iso) return `<td class="muted">never</td>`;
  const a = age(iso, now);
  const label = a.text === "now" ? "just now" : a.relative ? `${a.text} ago` : a.text;
  return `<td><time datetime="${h(iso)}" title="${h(iso)}">${h(label)}</time></td>`;
}

/** "/sources": config joined with item counts and the latest fetch run per source. */
export async function sourcesPage(env: Env): Promise<Response> {
  const now = new Date();
  const stats = await sourceStats(env.DB, now);

  const sorted = [...SOURCES].sort(
    (a, b) =>
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
      a.name.localeCompare(b.name, "en", { sensitivity: "base" })
  );

  const rows: string[] = [];
  for (const s of sorted) {
    const c = stats.counts.get(s.id);
    const latest = stats.latest.get(s.id);
    const failed = latest && latest.ok === 0;
    rows.push(`<tr>
<td><a href="${h(siteFor(s))}" target="_blank" rel="noopener">${h(s.name)}</a></td>
<td class="muted">${h(s.kind)}</td>
<td class="muted">${h(CATEGORY_NAME[s.category])}</td>
${c ? `<td class="n">${c.total}</td><td class="n">${c.last30}</td>` : `<td class="muted" colspan="2">no items yet</td>`}
${timeCell(stats.lastOk.get(s.id), now)}
<td class="${failed ? "err" : "muted"}">${failed ? h(latest.error ?? "failed") : latest ? "ok" : ""}</td>
</tr>`);
  }

  // Ids that have rows but are no longer in config: history is kept, nothing fetches them.
  const configured = new Set(SOURCES.map((s) => s.id));
  const orphaned = [...new Set([...stats.counts.keys(), ...stats.latest.keys()])]
    .filter((id) => !configured.has(id))
    .sort();
  for (const id of orphaned) {
    const c = stats.counts.get(id);
    rows.push(`<tr class="muted">
<td>${h(id)}</td>
<td>—</td>
<td>—</td>
<td class="n">${c?.total ?? 0}</td><td class="n">${c?.last30 ?? 0}</td>
${timeCell(stats.lastOk.get(id), now)}
<td>inactive</td>
</tr>`);
  }

  const body = `<h1>Sources <span>${SOURCES.length} configured</span></h1>
<div class="tablewrap">
<table>
<thead><tr><th>Source</th><th>Kind</th><th>Category</th><th class="n">Items</th><th class="n">30d</th><th>Last OK</th><th>Last run</th></tr></thead>
<tbody>
${rows.join("\n")}
</tbody>
</table>
</div>`;

  return htmlResponse(env, { title: "Sources", body });
}
