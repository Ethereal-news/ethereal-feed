import type { Env } from "../../index";
import { CATEGORIES } from "../../config/categories";
import { SOURCE_BY_ID } from "../../config/sources";
import { authorName, listStories, newsletterAppearances, storyItems, type ItemRow, type Story } from "../../db/items";
import { escapeHtml as h } from "../escape";
import { htmlResponse } from "../layout";
import { storyKeys } from "../render";
import { parseDay } from "./day";

/**
 * "/draft" and "/draft.md": published items since a date, grouped under the
 * newsletter section headers, as the starting point for writing an issue.
 * The page shows a rendered preview; Copy puts the markdown on the
 * clipboard and /draft.md serves it raw. Unlisted; no-store.
 */

/**
 * Default "since": midnight UTC of the most recent Friday strictly before
 * `now`. Issues go out on Fridays, so the draft covers everything since the
 * last one; on a Friday that is the previous Friday, a full week back.
 */
export function lastFriday(now = new Date()): Date {
  const back = (now.getUTCDay() - 5 + 7) % 7 || 7; // Fri=5
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - back));
  return d;
}

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

/** A story's bullet: the primary, then its other items as sub-bullets. */
interface Bullet {
  line: Line;
  sub: Line[];
}

/** Stories grouped under the newsletter sections (by the primary's category), in section order; empty sections omitted. */
function sections(stories: Story[], issues: Map<string, string>): Array<{ name: string; bullets: Bullet[] }> {
  const out: Array<{ name: string; bullets: Bullet[] }> = [];
  for (const c of CATEGORIES) {
    const bullets = stories
      .filter((s) => s.primary.category === c.slug)
      .map((s) => ({
        line: lineFor(s.primary, issues.has(s.primary.key)),
        sub: storyItems(s).slice(1).map((i) => lineFor(i, issues.has(i.key))),
      }));
    if (bullets.length) out.push({ name: c.name, bullets });
  }
  return out;
}

function mdLine(l: Line): string {
  const title = `[${mdText(l.title)}](${l.url})`;
  return `${l.author ? `${l.author}: ` : ""}${title}${l.kind ? ` (${l.kind})` : ""}${l.description ? `: ${l.description}` : ""}${l.inIssue ? " ← issue" : ""}`;
}

function mdBullet(b: Bullet): string {
  return [`* ${mdLine(b.line)}`, ...b.sub.map((l) => `  * ${mdLine(l)}`)].join("\n");
}

/** The whole draft as markdown, the form an issue is written in. */
export function draftMarkdown(stories: Story[], issues: Map<string, string>): string {
  const parts = sections(stories, issues).map((s) => `### ${s.name}\n\n${s.bullets.map(mdBullet).join("\n")}`);
  return parts.join("\n\n") + (parts.length ? "\n" : "");
}

function htmlLine(l: Line): string {
  return `${l.author ? `${h(l.author)}: ` : ""}<a href="${h(l.url)}">${h(l.title)}</a>${l.kind ? ` (${h(l.kind)})` : ""}${l.description ? `: ${h(l.description)}` : ""}${l.inIssue ? ` <span class="issue">← issue</span>` : ""}`;
}

function htmlBullet(b: Bullet): string {
  const sub = b.sub.length ? `\n<ul>\n${b.sub.map((l) => `<li>${htmlLine(l)}</li>`).join("\n")}\n</ul>` : "";
  return `<li>${htmlLine(b.line)}${sub}</li>`;
}

/** The same draft rendered as it would read in an issue. */
export function draftHtml(stories: Story[], issues: Map<string, string>): string {
  return sections(stories, issues)
    .map((s) => `<h3>${h(s.name)}</h3>\n<ul>\n${s.bullets.map(htmlBullet).join("\n")}\n</ul>`)
    .join("\n");
}

/** since=YYYY-MM-DD (UTC), default the last Friday; null when malformed. */
function sinceFrom(request: Request): Date | null {
  const raw = new URL(request.url).searchParams.get("since");
  if (!raw) return lastFriday();
  return parseDay(raw);
}

async function build(env: Env, since: Date): Promise<{ md: string; html: string; count: number }> {
  const stories = await listStories(env.DB, { from: since.toISOString() });
  const issues = await newsletterAppearances(env.DB, storyKeys(stories));
  return { md: draftMarkdown(stories, issues), html: draftHtml(stories, issues), count: stories.length };
}

const COPY_JS = `(function(){var b=document.getElementById("copy"),p=document.getElementById("draft");if(!b||!p)return;b.addEventListener("click",function(){navigator.clipboard.writeText(p.textContent||"").then(function(){b.textContent="Copied";setTimeout(function(){b.textContent="Copy"},1500)})})})();`;

export async function draftPage(request: Request, env: Env): Promise<Response> {
  const since = sinceFrom(request);
  if (!since) return new Response("Bad since date; use YYYY-MM-DD", { status: 400 });
  const key = since.toISOString().slice(0, 10);
  const { md, html, count } = await build(env, since);

  const body = `<div class="draft">
<h1>Draft <span>${count} stories since ${h(key)}</span></h1>
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
