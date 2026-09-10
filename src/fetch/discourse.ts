import type { DiscourseSource } from "../config/sources";
import type { RawItem } from "./run";
import { fetchJson, fetchText } from "./http";
import { stripHtml, truncate } from "./html";
import { parseFeed } from "./rss";

/**
 * Discourse forums via /latest.rss. Topic identity is the numeric id, because
 * the slug is regenerated whenever the title is edited.
 */

const TOPIC_RE = /\/t\/(?:[^/]+\/)?(\d+)(?:\/(\d+))?\/?$/;

/** { id, post } from a Discourse topic URL, or null. `post` is set for reply links. */
export function parseTopicUrl(url: string): { id: string; post?: string } | null {
  const m = url.match(TOPIC_RE);
  if (!m) return null;
  return { id: m[1], post: m[2] };
}

/** Discourse appends "N posts - M participants" and "Read full topic" to the body. */
export function discourseDescription(html: string): string {
  const body = html
    .replace(/<p>\s*<small>[\s\S]*?<\/small>\s*<\/p>/gi, " ")
    .replace(/<p>\s*<a[^>]*>\s*Read full topic\s*<\/a>\s*<\/p>/gi, " ");
  return truncate(stripHtml(body));
}

interface LatestJson {
  users?: Array<{ username: string; name?: string | null }>;
}

/**
 * username -> display name for the posters in /latest.json, which covers the
 * same topics as /latest.rss. Names that are unset or just echo the username
 * are left out so the username shows instead. Failure is non-fatal.
 */
export async function fetchDisplayNames(base: string): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  try {
    const json = await fetchJson<LatestJson>(`${base}/latest.json`);
    for (const u of json.users ?? []) {
      const name = (u.name ?? "").trim();
      if (name && name.toLowerCase() !== u.username.toLowerCase()) names.set(u.username, name);
    }
  } catch {
    // Fall back to usernames.
  }
  return names;
}

export async function fetchDiscourse(source: DiscourseSource): Promise<RawItem[]> {
  const base = source.url.replace(/\/$/, "");
  const host = new URL(base).host;
  const xml = await fetchText(`${base}/latest.rss`, { Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8" });
  const names = await fetchDisplayNames(base);

  const items: RawItem[] = [];
  for (const e of parseFeed(xml)) {
    if (!e.published || !e.title) continue;
    const topic = parseTopicUrl(e.url);
    // Skip anything that isn't a top-level topic (reply links carry a post number).
    if (!topic || topic.post) continue;
    const author = e.author.replace(/^@/, "") || undefined;
    items.push({
      key: `discourse:${host}:${topic.id}`,
      url: `${base}/t/${topic.id}`,
      title: stripHtml(e.title),
      description: discourseDescription(e.description),
      // dc:creator is "@username"; trustedAuthors are bare usernames.
      author,
      author_name: author ? names.get(author) : undefined,
      published_at: e.published.toISOString(),
    });
  }
  return items;
}
