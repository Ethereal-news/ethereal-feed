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

/** First paragraph of the release notes with the obvious markdown removed. */
export function releaseDescription(body: string | null, max = 200): string {
  if (!body) return "";
  const first = body
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => p.length > 0 && !/^<!--/.test(p));
  if (!first) return "";
  const cleaned = first
    .replace(/<[^>]+>/g, "")
    .replace(/#{1,6}\s*/g, "")
    .replace(/\*\*|__/g, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return truncate(cleaned, max);
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
