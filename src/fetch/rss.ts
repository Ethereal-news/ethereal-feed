import { XMLParser } from "fast-xml-parser";
import type { RssSource } from "../config/sources";
import type { RawItem } from "./run";
import { fetchText } from "./http";
import { normalizeUrl, parseDate, stripHtml, truncate } from "./html";

type Node = Record<string, unknown>;

// parseTagValue: false keeps numeric-looking guids and titles as strings.
export const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: true,
});

/** Text content of an element that may carry attributes ({ "#text": ..., "@_type": ... }). */
export function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const t = (v as Node)["#text"];
    return t == null ? "" : String(t);
  }
  return String(v);
}

export function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

export interface FeedEntry {
  title: string;
  url: string;
  guid: string;
  description: string;
  author: string;
  published: Date | null;
}

function parseRss2(channel: Node): FeedEntry[] {
  return asArray(channel.item as Node | Node[]).map((item) => ({
    title: text(item.title),
    url: text(item.link),
    guid: text(item.guid),
    description: text(item.description) || text(item["content:encoded"]),
    author: text(item["dc:creator"]) || text(item.author),
    published: parseDate(text(item.pubDate) || text(item["dc:date"])),
  }));
}

function atomLink(link: unknown): string {
  const links = asArray(link as Node | Node[]);
  const alt = links.find((l) => typeof l === "object" && (l["@_rel"] === "alternate" || !l["@_rel"]));
  const pick = alt ?? links[0];
  if (pick == null) return "";
  return typeof pick === "object" ? String(pick["@_href"] ?? "") : String(pick);
}

function parseAtom(feed: Node): FeedEntry[] {
  return asArray(feed.entry as Node | Node[]).map((entry) => {
    const author = entry.author as Node | Node[] | undefined;
    return {
      title: text(entry.title),
      url: atomLink(entry.link),
      guid: text(entry.id),
      description: text(entry.content) || text(entry.summary),
      author: text(asArray(author)[0]?.name),
      published: parseDate(text(entry.published) || text(entry.updated)),
    };
  });
}

/** Parse RSS 2.0 or Atom into a flat entry list. Unknown documents yield []. */
export function parseFeed(xml: string): FeedEntry[] {
  const data = xmlParser.parse(xml) as Node;
  const rss = data.rss as Node | undefined;
  if (rss?.channel) return parseRss2(rss.channel as Node);
  if (data.feed) return parseAtom(data.feed as Node);
  // RSS 1.0 / RDF: items are siblings of <channel>.
  const rdf = data["rdf:RDF"] as Node | undefined;
  if (rdf?.item) return parseRss2(rdf);
  return [];
}

/** Key per PLAN §3: rss:<source_id>:<guid>, falling back to the normalized URL. */
export function feedKey(sourceId: string, guid: string, url: string): string {
  return `rss:${sourceId}:${guid || normalizeUrl(url)}`;
}

/** Some feeds emit a placeholder like "..." instead of a summary; treat it as empty. */
export function cleanDescription(html: string): string {
  const t = truncate(stripHtml(html));
  return /^[\s.…\-–—]*$/.test(t) ? "" : t;
}

export async function fetchRss(source: RssSource): Promise<RawItem[]> {
  const xml = await fetchText(source.url, { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8" });
  const items: RawItem[] = [];
  for (const e of parseFeed(xml)) {
    if (!e.published || !e.title) continue;
    const url = source.rewriteUrl ? source.rewriteUrl(e.url) : e.url;
    if (!url) continue;
    const title = stripHtml(e.title);
    if (source.titleFilter && !source.titleFilter.test(title)) continue;
    items.push({
      key: feedKey(source.id, e.guid, url),
      url,
      title,
      description: cleanDescription(e.description),
      author: e.author || undefined,
      published_at: e.published.toISOString(),
    });
  }
  return items;
}
