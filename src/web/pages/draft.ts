import type { Env } from "../../index";
import { CATEGORIES } from "../../config/categories";
import { SOURCE_BY_ID } from "../../config/sources";
import { authorName, listPublished, newsletterAppearances, type ItemRow } from "../../db/items";
import { escapeHtml as h } from "../escape";
import { htmlResponse } from "../layout";
import { parseDay } from "./day";

/**
 * "/draft" and "/draft.md": published items since a date, grouped under the
 * newsletter section headers in the issue's markdown style, as the starting
 * point for writing an issue. Unlisted; no-store.
 */

const DEFAULT_DAYS = 7;

/** Escape the bits of a title that would break a markdown link. */
function mdText(s: string): string {
  return s.replace(/[[\]]/g, "\\$&");
}

function mdLine(item: ItemRow, inIssue: boolean): string {
  const source = SOURCE_BY_ID[item.source_id];
  const title = `[${mdText(item.title)}](${item.url})`;
  const forum = source?.type === "discourse";
  const author = forum ? authorName(item) : null;
  const kind = source && source.kind !== "blog" && !forum ? ` (${source.kind})` : "";
  const summary = item.description ? `: ${item.description}` : "";
  return `* ${author ? `${author}: ` : ""}${title}${kind}${summary}${inIssue ? " ← issue" : ""}`;
}

/** The whole draft as markdown; empty sections are omitted. */
export function draftMarkdown(items: ItemRow[], issues: Map<string, string>): string {
  const sections: string[] = [];
  for (const c of CATEGORIES) {
    const lines = items.filter((i) => i.category === c.slug).map((i) => mdLine(i, issues.has(i.key)));
    if (lines.length) sections.push(`### ${c.name}\n\n${lines.join("\n")}`);
  }
  return sections.join("\n\n") + (sections.length ? "\n" : "");
}

/** since=YYYY-MM-DD (UTC), default 7 days ago; null when malformed. */
function sinceFrom(request: Request): Date | null {
  const raw = new URL(request.url).searchParams.get("since");
  if (!raw) return new Date(Date.now() - DEFAULT_DAYS * 86_400_000);
  return parseDay(raw);
}

async function build(env: Env, since: Date): Promise<{ md: string; count: number }> {
  const items = await listPublished(env.DB, { from: since.toISOString() });
  const issues = await newsletterAppearances(env.DB, items.map((i) => i.key));
  return { md: draftMarkdown(items, issues), count: items.length };
}

const COPY_JS = `(function(){var b=document.getElementById("copy"),p=document.getElementById("draft");if(!b||!p)return;b.addEventListener("click",function(){navigator.clipboard.writeText(p.textContent||"").then(function(){b.textContent="Copied";setTimeout(function(){b.textContent="Copy"},1500)})})})();`;

export async function draftPage(request: Request, env: Env): Promise<Response> {
  const since = sinceFrom(request);
  if (!since) return new Response("Bad since date; use YYYY-MM-DD", { status: 400 });
  const key = since.toISOString().slice(0, 10);
  const { md, count } = await build(env, since);

  const body = `<div class="draft">
<h1>Draft <span>${count} items since ${h(key)}</span></h1>
<form class="since" method="get" action="/draft">
<label>Since <input type="date" name="since" value="${h(key)}" max="${h(new Date().toISOString().slice(0, 10))}"></label>
<button class="pill" type="submit">Update</button>
<button class="pill" type="button" id="copy">Copy</button>
<a class="pill" href="/draft.md?since=${h(key)}">Markdown</a>
</form>
${md ? `<pre id="draft">${h(md)}</pre>` : `<p class="empty">Nothing published since ${h(key)}.</p>`}
</div>
<script>${COPY_JS}</script>`;

  return htmlResponse(env, {
    title: "Draft",
    description: "Newsletter draft: published items grouped by section.",
    path: "/draft",
    private: true,
    body,
  });
}

export async function draftMarkdownResponse(request: Request, env: Env): Promise<Response> {
  const since = sinceFrom(request);
  if (!since) return new Response("Bad since date; use YYYY-MM-DD", { status: 400 });
  const { md } = await build(env, since);
  return new Response(md, {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store" },
  });
}
