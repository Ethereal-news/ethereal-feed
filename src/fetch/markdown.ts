import type { Env } from "../index";
import type { MarkdownSource } from "../config/sources";
import { MAX_AGE_DAYS, type RawItem } from "./run";
import { fetchJson, fetchText, githubHeaders } from "./http";
import { normalizeUrl, truncate } from "./html";

/** Blogs whose posts live as markdown files in a GitHub repo, named YYYYMMDD-slug.md. */

interface ContentEntry {
  name: string;
  type: string;
  download_url: string | null;
}

// Front matter values may be quoted with ' or ", e.g. title: "A post".
function frontMatterField(frontMatter: string, field: string): string {
  const m = frontMatter.match(new RegExp(`^${field}:\\s*(?:"([^"]*)"|'([^']*)'|(.*))$`, "m"));
  if (!m) return "";
  return (m[1] ?? m[2] ?? m[3] ?? "").trim();
}

function fileDate(name: string): Date | null {
  const m = name.match(/^(\d{4})(\d{2})(\d{2})-/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

async function fetchPost(source: MarkdownSource, entry: ContentEntry, fallback: Date): Promise<RawItem | null> {
  if (!entry.download_url) return null;
  const markdown = await fetchText(entry.download_url);
  const frontMatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
  const slug = entry.name.replace(/\.md$/, "");

  // The front matter date is authoritative when present; the filename prefix
  // is what we filtered on, and the two can differ.
  const dated = new Date(`${frontMatterField(frontMatter, "date")}T00:00:00Z`);
  const published = isNaN(dated.getTime()) ? fallback : dated;
  const url = source.postUrl(slug);

  return {
    key: `rss:${source.id}:${normalizeUrl(url)}`,
    url,
    title: frontMatterField(frontMatter, "title") || slug,
    description: truncate(frontMatterField(frontMatter, "excerpt")),
    published_at: published.toISOString(),
  };
}

export async function fetchMarkdown(source: MarkdownSource, env: Env): Promise<RawItem[]> {
  const listing = await fetchJson<ContentEntry[]>(
    `https://api.github.com/repos/${source.owner}/${source.repo}/contents/${source.path}`,
    githubHeaders(env.GITHUB_TOKEN)
  );
  if (!Array.isArray(listing)) throw new Error("contents listing is not a directory");

  // Only the filename date is available from the listing; use it to decide
  // which posts are worth downloading in full.
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 86_400_000);
  cutoff.setUTCHours(0, 0, 0, 0);
  const recent: Array<{ entry: ContentEntry; date: Date }> = [];
  for (const entry of listing) {
    if (entry.type !== "file" || !entry.name.endsWith(".md")) continue;
    const date = fileDate(entry.name);
    if (date && date >= cutoff) recent.push({ entry, date });
  }

  const posts = await Promise.all(recent.map(({ entry, date }) => fetchPost(source, entry, date)));
  return posts.filter((p): p is RawItem => p !== null);
}
