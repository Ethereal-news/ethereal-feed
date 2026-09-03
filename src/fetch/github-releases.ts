import type { Env } from "../index";
import type { ReleaseSource } from "../config/sources";
import type { RawItem } from "./run";
import { fetchJson, githubHeaders } from "./http";
import { truncate } from "./html";

interface GitHubRelease {
  tag_name: string;
  name: string | null;
  html_url: string;
  published_at: string | null;
  body: string | null;
  prerelease: boolean;
  draft: boolean;
}

export function extractVersion(tagName: string): string {
  return tagName.replace(/^v(?=\d)/, "");
}

/** Section labels that release templates emit as a first paragraph. */
const BOILERPLATE = /^(changes|changelog|what'?s changed|release notes|highlights|notes)$/i;
const MIN_DESCRIPTION_CHARS = 25;

/** Markdown paragraph to plain text. */
function plain(paragraph: string): string {
  return paragraph
    .replace(/<[^>]+>/g, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*|__/g, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    // changesets prefix: "#5059 e3de334a… Thanks @jxom! - actual note"
    .replace(/(?:#\d+\s+)?(?:[0-9a-f]{7,40}\s+)?Thanks @[\w-]+!\s*-\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the text carries no information: a bare label, or too short once emoji and punctuation go. */
export function isNoise(text: string): boolean {
  const bare = text
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return bare.length < MIN_DESCRIPTION_CHARS || BOILERPLATE.test(bare);
}

/**
 * First informative paragraph of the release notes. The first paragraph is
 * dropped when it is only a heading or template boilerplate; after that,
 * headings are skipped and the next non-noise paragraph wins, else "".
 */
export function releaseDescription(body: string | null, max = 200): string {
  if (!body) return "";
  const paragraphs = body
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !p.startsWith("<!--"));

  for (const p of paragraphs) {
    if (/^#{1,6}\s/.test(p)) continue;
    const text = plain(p);
    if (isNoise(text)) continue;
    return truncate(text, max);
  }
  return "";
}

/** GitHub's flag, plus tags/names that look like pre-releases without the flag set. */
export function isPrerelease(r: { prerelease: boolean; tag_name: string; name: string | null }): boolean {
  if (r.prerelease) return true;
  const lower = `${r.tag_name} ${r.name ?? ""}`.toLowerCase();
  return /-(rc|alpha|beta|dev|nightly|canary|pre)[.\d-]|\.rc\d/i.test(lower);
}

export async function fetchReleases(source: ReleaseSource, env: Env): Promise<RawItem[]> {
  const releases = await fetchJson<GitHubRelease[]>(
    `https://api.github.com/repos/${source.owner}/${source.repo}/releases?per_page=10`,
    githubHeaders(env.GITHUB_TOKEN)
  );

  const items: RawItem[] = [];
  for (const r of releases) {
    if (r.draft || !r.published_at) continue;
    if (source.tagFilter && !source.tagFilter.test(r.tag_name)) continue;
    items.push({
      key: `release:${source.owner}/${source.repo}:${r.tag_name}`,
      url: r.html_url,
      title: `${source.name} ${r.tag_name}`,
      description: releaseDescription(r.body),
      version: extractVersion(r.tag_name),
      prerelease: isPrerelease(r),
      published_at: new Date(r.published_at).toISOString(),
    });
  }
  return items;
}
