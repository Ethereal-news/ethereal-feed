import type { ScrapedSource } from "../config/sources";
import type { RawItem } from "./run";
import { fetchText } from "./http";
import { decodeEntities, normalizeUrl, truncate } from "./html";

export interface ScrapedEntry {
  href: string;
  title: string;
  description: string;
  published: Date;
}

type Parser = (html: string) => ScrapedEntry[];

function parseConsensusBlog(html: string): ScrapedEntry[] {
  const itemRegex =
    /<div class="blog-list-item"><a href="([^"]+)"><div class="blog-list-item-date">([^<]+)<\/div><div class="blog-list-item-title">([^<]+)<\/div><div class="blog-list-item-excerpt">([^<]+)<\/div>/g;
  const entries: ScrapedEntry[] = [];
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(html)) !== null) {
    const [, href, dateStr, title, excerpt] = m;
    entries.push({
      href,
      title: decodeEntities(title),
      description: decodeEntities(excerpt),
      published: new Date(`${dateStr} UTC`),
    });
  }
  return entries;
}

function parsePseBlog(html: string): ScrapedEntry[] {
  // Each post card opens with <a class="group ..." href="/blog/SLUG">. Inside:
  // a date <span class="text-xs ... uppercase ...">May 8, 2026</span>, a title
  // <a class="font-display ..." href="/blog/SLUG">Title</a>, optional excerpt
  // <span class="text-sm font-san ...">Excerpt</span>.
  const cardOpen = /<a class="group[^"]*" href="(\/blog\/[a-z0-9-]+)"/g;
  const dateRe = /<span class="text-xs[^"]*uppercase[^"]*">([^<]+)<\/span>/;
  const titleRe = /<a class="font-display[^"]*" href="\/blog\/[^"]+">([^<]+)<\/a>/;
  const excerptRe = /<span class="text-sm font-san[^"]*">([^<]+)<\/span>/;

  const entries: ScrapedEntry[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = cardOpen.exec(html)) !== null) {
    const href = m[1];
    if (seen.has(href)) continue;
    seen.add(href);

    const start = m.index;
    const next = html.indexOf('<a class="group', start + 1);
    const chunk = html.slice(start, next === -1 ? start + 4000 : next);

    const dateMatch = chunk.match(dateRe);
    const titleMatch = chunk.match(titleRe);
    if (!dateMatch || !titleMatch) continue;

    const excerptMatch = chunk.match(excerptRe);
    entries.push({
      href,
      title: decodeEntities(titleMatch[1]),
      description: excerptMatch ? decodeEntities(excerptMatch[1]) : "",
      published: new Date(`${dateMatch[1]} UTC`),
    });
  }
  return entries;
}

function parseFeBlog(html: string): ScrapedEntry[] {
  // Zola list template:
  //   <section class="list-item">
  //     <h1 class="title"><a href=URL>Title</a></h1>   (href may be unquoted, entity-escaped)
  //     <time>YYYY-MM-DD</time>
  const itemRegex =
    /<section class="list-item">[\s\S]*?<h1 class="title">\s*<a href=["']?([^"'\s>]+)["']?>([^<]+)<\/a>[\s\S]*?<time>(\d{4}-\d{2}-\d{2})<\/time>/g;
  const entries: ScrapedEntry[] = [];
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(html)) !== null) {
    const [, rawHref, title, dateStr] = m;
    entries.push({
      href: decodeEntities(rawHref),
      title: decodeEntities(title),
      description: "",
      published: new Date(`${dateStr}T00:00:00Z`),
    });
  }
  return entries;
}

function parseTerenceBlog(html: string): ScrapedEntry[] {
  // <li> <a href="/writing/SLUG">Title</a> <span class="meta">Jul 21, 2026</span> </li>
  const itemRegex = /<li>\s*<a href="(\/writing\/[^"]+)">([^<]+)<\/a>\s*<span class="meta">([^<]+)<\/span>/g;
  const entries: ScrapedEntry[] = [];
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(html)) !== null) {
    const [, href, title, dateStr] = m;
    entries.push({
      href,
      title: decodeEntities(title),
      description: "",
      published: new Date(`${dateStr} UTC`),
    });
  }
  return entries;
}

export const PARSERS: Record<ScrapedSource["parser"], Parser> = {
  consensus: parseConsensusBlog,
  pse: parsePseBlog,
  fe: parseFeBlog,
  terence: parseTerenceBlog,
};

export async function fetchScraped(source: ScrapedSource): Promise<RawItem[]> {
  const html = await fetchText(source.listUrl, { Accept: "text/html" });
  const entries = PARSERS[source.parser](html);
  if (entries.length === 0) {
    // A parser that matches nothing almost always means the markup changed.
    throw new Error(`parser "${source.parser}" matched no posts`);
  }
  const items: RawItem[] = [];
  for (const e of entries) {
    if (isNaN(e.published.getTime()) || !e.title) continue;
    const url = new URL(e.href, source.baseUrl).toString();
    items.push({
      key: `rss:${source.id}:${normalizeUrl(url)}`,
      url,
      title: e.title.trim(),
      description: truncate(e.description),
      published_at: e.published.toISOString(),
    });
  }
  return items;
}
