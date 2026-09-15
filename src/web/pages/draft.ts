import type { Env } from "../../index";
import { CATEGORIES } from "../../config/categories";
import { SOURCE_BY_ID } from "../../config/sources";
import { authorName, listPublished, newsletterAppearances, type ItemRow } from "../../db/items";
import { escapeHtml as h } from "../escape";
import { htmlResponse } from "../layout";
import { parseDay } from "./day";

/**
 * "/draft" and "/draft.md": published items since a date, grouped under the
 * newsletter section headers, as the starting point for writing an issue.
 * The page shows a rendered preview; Copy puts the markdown on the
 * clipboard and /draft.md serves it raw. Unlisted; no-store.
 */

const DEFAULT_DAYS = 7;

/** Escape the bits of a title that would break a markdown link. */
function mdText(s: string): string {
  return s.replace(/[[\]]/g, "\\$&");
}

/** One draft line, before it is written as markdown or HTML. */
interface Line {
  author: string | null;
  title: string;
  url: string;
  kind: string | null;
  description: string;
  inIssue: boolean;
}

function lineFor(item: ItemRow, inIssue: boolean): Line {
  const source = SOURCE_BY_ID[item.source_id];
  const forum = source?.type === "discourse";
  return {
    author: forum ? authorName(item) : null,
    title: item.title,
    url: item.url,
    kind: source && source.kind !== "blog" && !forum ? source.kind : null,
    description: item.description,
    inIssue,
  };
}

/** Items grouped under the newsletter sections, in section order; empty sections omitted. */
function sections(items: ItemRow[], issues: Map<string, string>): Array<{ name: string; lines: Line[] }> {
  const out: Array<{ name: string; lines: Line[] }> = [];
  for (const c of CATEGORIES) {
    const lines = items.filter((i) => i.category === c.slug).map((i) => lineFor(i, issues.has(i.key)));
    if (lines.length) out.push({ name: c.name, lines });
  }
  return out;
}

function mdLine(l: Line): string {
  const title = `[${mdText(l.title)}](${l.url})`;
  return `* ${l.author ? `${l.author}: ` : ""}${title}${l.kind ? ` (${l.kind})` : ""}${l.description ? `: ${l.description}` : ""}${l.inIssue ? " ← issue" : ""}`;
}

/** The whole draft as markdown, the form an issue is written in. */
export function draftMarkdown(items: ItemRow[], issues: Map<string, string>): string {
  const parts = sections(items, issues).map((s) => `### ${s.name}\n\n${s.lines.map(mdLine).join("\n")}`);
  return parts.join("\n\n") + (parts.length ? "\n" : "");
}

function htmlLine(l: Line): string {
  return `<li>${l.author ? `${h(l.author)}: ` : ""}<a href="${h(l.url)}">${h(l.title)}</a>${l.kind ? ` (${h(l.kind)})` : ""}${l.description ? `: ${h(l.description)}` : ""}${l.inIssue ? ` <span class="issue">← issue</span>` : ""}</li>`;
}

/** The same draft rendered as it would read in an issue. */
export function draftHtml(items: ItemRow[], issues: Map<string, string>): string {
  return sections(items, issues)
    .map((s) => `<h3>${h(s.name)}</h3>\n<ul>\n${s.lines.map(htmlLine).join("\n")}\n</ul>`)
    .join("\n");
}

/** since=YYYY-MM-DD (UTC), default 7 days ago; null when malformed. */
function sinceFrom(request: Request): Date | null {
  const raw = new URL(request.url).searchParams.get("since");
  if (!raw) return new Date(Date.now() - DEFAULT_DAYS * 86_400_000);
  return parseDay(raw);
}

async function build(env: Env, since: Date): Promise<{ md: string; html: string; count: number }> {
  const items = await listPublished(env.DB, { from: since.toISOString() });
  const issues = await newsletterAppearances(env.DB, items.map((i) => i.key));
  return { md: draftMarkdown(items, issues), html: draftHtml(items, issues), count: items.length };
}

const COPY_JS = `(function(){var b=document.getElementById("copy"),p=document.getElementById("draft");if(!b||!p)return;b.addEventListener("click",function(){navigator.clipboard.writeText(p.textContent||"").then(function(){b.textContent="Copied";setTimeout(function(){b.textContent="Copy"},1500)})})})();`;

export async function draftPage(request: Request, env: Env): Promise<Response> {
  const since = sinceFrom(request);
  if (!since) return new Response("Bad since date; use YYYY-MM-DD", { status: 400 });
  const key = since.toISOString().slice(0, 10);
  const { md, html, count } = await build(env, since);

  const body = `<div class="draft">
<h1>Draft <span>${count} items since ${h(key)}</span></h1>
<form class="since" method="get" action="/draft">
<label>Since <input type="date" name="since" value="${h(key)}" max="${h(new Date().toISOString().slice(0, 10))}"></label>
<button class="pill" type="submit">Update</button>
<button class="pill" type="button" id="copy">Copy</button>
<a class="pill" href="/draft.md?since=${h(key)}">Markdown</a>
</form>
${md ? `<div class="preview">${html}</div>\n<pre id="draft" hidden>${h(md)}</pre>` : `<p class="empty">Nothing published since ${h(key)}.</p>`}
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
