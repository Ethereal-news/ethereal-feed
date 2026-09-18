import type { Env } from "../../index";
import { CATEGORIES, type Category } from "../../config/categories";
import { SOURCE_BY_ID, type Kind } from "../../config/sources";
import { authorName, listStories, newsletterAppearances, storyItems, type ItemRow, type Story } from "../../db/items";
import { escapeHtml as h } from "../escape";
import { htmlResponse } from "../layout";
import { storyKeys } from "../render";
import { parseDay } from "./day";

/**
 * "/draft" and "/draft.md": published items since a date, grouped under the
 * newsletter section headers, as the starting point for writing an issue.
 * Lines follow the issue's house style: org before a release, its version
 * without the raw tag, one bullet per source, Forkcast status changes grouped
 * under their All core devs call. The page shows a rendered preview; Copy
 * puts the markdown on the clipboard and /draft.md serves it raw. Unlisted;
 * no-store.
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

// ------------------------------------------------------------------ document
// The draft is built once as a small tree, then written as markdown or HTML.

/** Inline content: text, a link, or the "already in an issue" marker. */
type Seg = string | { text: string; url: string } | { issue: true };

/** A bullet and its sub-bullets. */
interface Node {
  segs: Seg[];
  children: Node[];
}

/** A heading with the bullets under it. */
interface Block {
  level: 3 | 4;
  heading: Seg[];
  nodes: Node[];
}

const link = (text: string, url: string): Seg => ({ text, url });
const node = (segs: Seg[], children: Node[] = []): Node => ({ segs, children });

// ------------------------------------------------------------------ releases

/** The newsletter's word for a kind, where it differs from ours. */
const KIND_LABEL: Partial<Record<Kind, string>> = { framework: "dev framework" };

/** The section that gets a "Client releases:" block, as the issue lays it out. */
const CLIENT_SECTION: Category = "staking";

const LAYERS = [
  ["consensus layer client", "Consensus layer"],
  ["execution layer client", "Execution layer"],
] as const;

/** Tag from a release key, "release:owner/repo:tag". */
function releaseTag(item: ItemRow): string {
  const rest = item.key.slice("release:".length);
  return rest.slice(rest.indexOf(":") + 1);
}

/**
 * Version as the issue prints it: the tag's own form ("v1.8.3", "26.9.0"),
 * with a monorepo package prefix turned into "v" ("hardhat@3.17.0" -> "v3.17.0")
 * and a path prefix dropped ("release/0.58.0" -> "0.58.0").
 */
export function releaseVersion(tag: string): string {
  const at = tag.lastIndexOf("@");
  if (at >= 0) {
    const v = tag.slice(at + 1);
    return /^\d/.test(v) ? `v${v}` : v;
  }
  return tag.slice(tag.lastIndexOf("/") + 1);
}

/** "Lodestar v1.48.0": source name and version, without the raw tag. */
function releaseTitle(item: ItemRow): string {
  const source = SOURCE_BY_ID[item.source_id];
  return source ? `${source.name} ${releaseVersion(releaseTag(item))}` : item.title;
}

/**
 * Upgrade priority a client states in the first lines of its notes
 * ("a strongly recommended upgrade", "medium-urgency release"), which the
 * issue prints in brackets. Null when the notes do not say.
 */
export function releasePriority(description: string): string | null {
  const d = description.toLowerCase();
  let m: RegExpMatchArray | null;
  if ((m = d.match(/\b(strongly|highly) recommend/))) return `${m[1]} recommended`;
  if ((m = d.match(/\b(low|medium|high)[- ](?:urgency|priority)\b/))) return m[1];
  if (/\bmandatory\b/.test(d)) return "mandatory";
  if (/\brecommend/.test(d)) return "recommended";
  return null;
}

/**
 * Several releases from one source in the window become one bullet: the
 * newest stays, the older ones are listed beneath it as "Earlier:" links.
 * Only stories headed by a release collapse; a release under a blog post
 * stays with the post.
 */
function collapseReleases(stories: Story[]): { kept: Story[]; earlier: Map<Story, ItemRow[]> } {
  const newest = new Map<string, Story>();
  const earlier = new Map<Story, ItemRow[]>();
  const kept: Story[] = [];
  for (const s of stories) {
    if (s.primary.source_type !== "release") {
      kept.push(s);
      continue;
    }
    const head = newest.get(s.primary.source_id);
    if (!head) {
      newest.set(s.primary.source_id, s);
      kept.push(s);
    } else {
      earlier.set(head, [...(earlier.get(head) ?? []), s.primary]);
    }
  }
  return { kept, earlier };
}

// ------------------------------------------------------------------ Forkcast

const FORKCAST = "forkcast";
const ACD_RE = /^AllCoreDevs - (Execution|Consensus|Testing) #0*(\d+) call published$/;
const CALL_RE = /^(.*?) #0*(\d+) call published$/;
const STATUS_RE = /^((?:EIP|ERC|RIP)-\d+) \((.*)\) is now (\w+) for (.+)$/;

const ACD_NAMES: Record<string, [string, string]> = {
  Execution: ["execution", "ACDE"],
  Consensus: ["consensus", "ACDC"],
  Testing: ["testing", "ACDT"],
};

/** The issue prints the ACD block after Security, before Layer 1. */
const ACD_BEFORE: Category = "layer-1";

/** Upgrades as the issue names them. Unknown forks print as Forkcast spells them. */
const FORKS: Record<string, { name: string; target?: number }> = {
  glamsterdam: { name: "Glamsterdam", target: 2026 },
  hegota: { name: "Hegotá", target: 2027 },
};

/** Inclusion stages, in the order they are listed under an upgrade. */
const STAGES: Record<string, { label: string; abbr?: string; anchor: string }> = {
  included: { label: "Included", anchor: "included" },
  scheduled: { label: "Scheduled for Inclusion", abbr: "SFI", anchor: "scheduled-for-inclusion" },
  considered: { label: "Considered for Inclusion", abbr: "CFI", anchor: "considered-for-inclusion" },
  declined: { label: "Declined for Inclusion", abbr: "DFI", anchor: "declined-for-inclusion" },
  proposed: { label: "Proposed for Inclusion", abbr: "PFI", anchor: "proposed-for-inclusion" },
  withdrawn: { label: "Withdrawn", anchor: "withdrawn" },
};

function acdCall(item: ItemRow): RegExpMatchArray | null {
  return item.source_id === FORKCAST ? item.title.match(ACD_RE) : null;
}

interface StatusChange {
  item: ItemRow;
  /** "EIP8015" */
  eip: string;
  name: string;
  stage: string;
  fork: string;
}

/**
 * House style for an EIP's name: no backticks, "&" for "and", and Title Case
 * words lowered while acronyms and mixed case ("RANDAO", "ePBS") stay.
 */
export function eipName(title: string): string {
  return title
    .replace(/`/g, "")
    .replace(/\band\b/gi, "&")
    .replace(/[A-Za-z]+/g, (w) => (/^[A-Z][a-z]+$/.test(w) ? w.toLowerCase() : w));
}

function statusChange(item: ItemRow): StatusChange | null {
  if (item.source_id !== FORKCAST) return null;
  const m = item.title.match(STATUS_RE);
  if (!m) return null;
  return { item, eip: m[1].replace("-", ""), name: eipName(m[2]), stage: m[3].toLowerCase(), fork: m[4].toLowerCase() };
}

/**
 * Status changes as the issue lists them: one bullet per upgrade, one
 * sub-bullet per stage with a count, then the EIPs on a single line.
 *   * [Hegotá](…) upgrade (targeting 2027):
 *     * 7 EIPs [Declined for Inclusion](…#declined-for-inclusion) (DFI):
 *       * [EIP8146](…) block access list sidecars, [EIP8237](…) …
 */
function statusNodes(changes: StatusChange[], inIssue: (i: ItemRow) => boolean): Node[] {
  const forks = new Map<string, StatusChange[]>();
  for (const c of changes) forks.set(c.fork, [...(forks.get(c.fork) ?? []), c]);

  const out: Node[] = [];
  for (const [fork, list] of forks) {
    const known = FORKS[fork];
    const upgrade = `https://forkcast.org/upgrade/${fork}/`;
    const stages = [...new Set(list.map((c) => c.stage))].sort(
      (a, b) => (Object.keys(STAGES).indexOf(a) + 1 || 99) - (Object.keys(STAGES).indexOf(b) + 1 || 99)
    );
    const stageNodes = stages.map((stage) => {
      const eips = list.filter((c) => c.stage === stage).sort((a, b) => a.eip.localeCompare(b.eip, "en", { numeric: true }));
      const info = STAGES[stage] ?? { label: stage[0].toUpperCase() + stage.slice(1), anchor: stage };
      const allIn = eips.every((c) => inIssue(c.item));
      const line: Seg[] = [];
      eips.forEach((c, i) => {
        if (i > 0) line.push(", ");
        line.push(link(c.eip, c.item.url), ` ${c.name}`);
        if (!allIn && inIssue(c.item)) line.push({ issue: true });
      });
      const head: Seg[] = [
        `${eips.length} ${stage === "proposed" ? "new " : ""}EIP${eips.length === 1 ? "" : "s"} `,
        link(info.label, `${upgrade}#${info.anchor}`),
        `${info.abbr ? ` (${info.abbr})` : ""}:`,
      ];
      if (allIn) head.push({ issue: true });
      return node(head, [node(line)]);
    });
    const name = known?.name ?? fork[0].toUpperCase() + fork.slice(1);
    out.push(node([link(name, upgrade), ` upgrade${known?.target ? ` (targeting ${known.target})` : ""}:`], stageNodes));
  }
  return out;
}

// ------------------------------------------------------------------ bullets

interface Ctx {
  inIssue: (i: ItemRow) => boolean;
  earlier: Map<Story, ItemRow[]>;
}

/** One item in house style. `client` swaps the kind for the stated upgrade priority. */
function itemNode(item: ItemRow, ctx: Ctx, client = false): Node {
  const source = SOURCE_BY_ID[item.source_id];
  const forum = source?.type === "discourse";
  const segs: Seg[] = [];
  const call = item.source_id === FORKCAST ? item.title.match(CALL_RE) : null;

  if (call) {
    // "FOCIL breakout [#42](…)"
    segs.push(`${call[1].replace(/\bBreakout\b/, "breakout")} `, link(`#${call[2]}`, item.url));
  } else {
    const author = forum ? authorName(item) : null;
    if (author) segs.push(`${author}: `);
    const release = item.source_type === "release";
    if (release && source?.org) segs.push(`${source.org} `);
    segs.push(link(release ? releaseTitle(item) : item.title, item.url));
    const paren = client
      ? releasePriority(item.description)
      : source && source.kind !== "blog" && !forum
        ? (source.kindLabel ?? KIND_LABEL[source.kind] ?? source.kind)
        : null;
    if (paren) segs.push(` (${paren})`);
    if (item.description) segs.push(`: ${item.description}`);
  }
  if (ctx.inIssue(item)) segs.push({ issue: true });
  return node(segs);
}

/** A story: the primary, its other items beneath, then any collapsed earlier releases. */
function storyNode(story: Story, ctx: Ctx, client = false): Node {
  const n = itemNode(story.primary, ctx, client);
  n.children = storyItems(story).slice(1).map((i) => itemNode(i, ctx));
  const older = ctx.earlier.get(story);
  if (older?.length) {
    const segs: Seg[] = ["Earlier: "];
    older.forEach((i, idx) => {
      if (idx > 0) segs.push(", ");
      segs.push(link(releaseVersion(releaseTag(i)), i.url));
      if (ctx.inIssue(i)) segs.push({ issue: true });
    });
    n.children.push(node(segs));
  }
  return n;
}

/** "#### All core devs - consensus (ACDC) [#187](…)" with its status changes beneath. */
function acdBlock(story: Story, ctx: Ctx): Block {
  const m = acdCall(story.primary)!;
  const [word, abbr] = ACD_NAMES[m[1]];
  const others = storyItems(story).slice(1);
  const changes = others.map(statusChange).filter((c): c is StatusChange => c !== null);
  const plain = others.filter((i) => !statusChange(i));
  const heading: Seg[] = [`All core devs - ${word} (${abbr}) `, link(`#${m[2]}`, story.primary.url)];
  if (ctx.inIssue(story.primary)) heading.push({ issue: true });
  return { level: 4, heading, nodes: [...statusNodes(changes, ctx.inIssue), ...plain.map((i) => itemNode(i, ctx))] };
}

/**
 * The whole draft: newsletter sections in order (by the primary's category),
 * empty ones omitted, with the All core devs block ahead of Layer 1 and
 * client releases grouped by layer at the end of Staking.
 */
function blocks(stories: Story[], issues: Map<string, string>): Block[] {
  const { kept, earlier } = collapseReleases(stories);
  const ctx: Ctx = { inIssue: (i) => issues.has(i.key), earlier };
  // The issue leads with the Execution or Consensus call, then Testing; oldest first within each.
  const testing = (s: Story) => Number(acdCall(s.primary)![1] === "Testing");
  const calls = kept
    .filter((s) => acdCall(s.primary))
    .reverse()
    .sort((a, b) => testing(a) - testing(b));
  const rest = kept.filter((s) => !acdCall(s.primary));

  const out: Block[] = [];
  for (const c of CATEGORIES) {
    if (c.slug === ACD_BEFORE && calls.length) {
      out.push({ level: 3, heading: ["All core devs (main protocol calls)"], nodes: [] });
      out.push(...calls.map((s) => acdBlock(s, ctx)));
    }
    const own = rest.filter((s) => s.primary.category === c.slug);
    if (own.length === 0) continue;

    // Status changes that no call picked up are still grouped by upgrade.
    const loose = own.map((s) => statusChange(s.primary)).filter((x): x is StatusChange => x !== null);
    const nodes: Node[] = statusNodes(loose, ctx.inIssue);
    const clients = new Map<string, Node[]>();
    for (const s of own) {
      if (statusChange(s.primary)) continue;
      const kind = SOURCE_BY_ID[s.primary.source_id]?.kind;
      const layer = c.slug === CLIENT_SECTION && s.primary.source_type === "release" ? LAYERS.find(([k]) => k === kind) : undefined;
      if (layer) clients.set(layer[1], [...(clients.get(layer[1]) ?? []), storyNode(s, ctx, true)]);
      else nodes.push(storyNode(s, ctx));
    }
    if (clients.size) {
      const layers = LAYERS.filter(([, label]) => clients.has(label)).map(([, label]) => node([`${label}:`], clients.get(label)!));
      nodes.push(node(["Client releases:"], layers));
    }
    out.push({ level: 3, heading: [c.name], nodes });
  }
  return out;
}

// ------------------------------------------------------------------ writers

function mdInline(segs: Seg[]): string {
  return segs
    .map((s) => (typeof s === "string" ? s : "issue" in s ? " ← issue" : `[${mdText(s.text)}](${s.url})`))
    .join("");
}

function mdNode(n: Node, depth = 0): string {
  return [`${"  ".repeat(depth)}* ${mdInline(n.segs)}`, ...n.children.map((c) => mdNode(c, depth + 1))].join("\n");
}

/** The whole draft as markdown, the form an issue is written in. */
export function draftMarkdown(stories: Story[], issues: Map<string, string>): string {
  const parts = blocks(stories, issues).map((b) =>
    [`${"#".repeat(b.level)} ${mdInline(b.heading)}`, ...(b.nodes.length ? [b.nodes.map((n) => mdNode(n)).join("\n")] : [])].join("\n\n")
  );
  return parts.join("\n\n") + (parts.length ? "\n" : "");
}

function htmlInline(segs: Seg[]): string {
  return segs
    .map((s) =>
      typeof s === "string"
        ? h(s)
        : "issue" in s
          ? ` <span class="issue">← issue</span>`
          : `<a href="${h(s.url)}">${h(s.text)}</a>`
    )
    .join("");
}

function htmlNode(n: Node): string {
  const sub = n.children.length ? `\n<ul>\n${n.children.map(htmlNode).join("\n")}\n</ul>` : "";
  return `<li>${htmlInline(n.segs)}${sub}</li>`;
}

/** The same draft rendered as it would read in an issue. */
export function draftHtml(stories: Story[], issues: Map<string, string>): string {
  return blocks(stories, issues)
    .map((b) => `<h${b.level}>${htmlInline(b.heading)}</h${b.level}>${b.nodes.length ? `\n<ul>\n${b.nodes.map(htmlNode).join("\n")}\n</ul>` : ""}`)
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
