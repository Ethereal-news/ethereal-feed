import type { Env } from "../index";
import { CATEGORY_NAME, type Category } from "../config/categories";
import { authorName, listStories, type ItemRow, type Story } from "../db/items";
import { escapeXml as x } from "./escape";
import { PUBLIC_CACHE } from "./layout";
import { categoryName, moreLabel } from "./render";

const FEED_LIMIT = 50;

interface FeedMeta {
  title: string;
  /** Page the feed describes, absolute. */
  homeUrl: string;
  /** This feed's own absolute URL. */
  selfUrl: string;
  description: string;
}

function meta(env: Env, category: Category | undefined, path: string): FeedMeta {
  const site = env.SITE_URL.replace(/\/$/, "");
  const name = category ? `${CATEGORY_NAME[category]} · ${env.SITE_NAME}` : env.SITE_NAME;
  return {
    title: name,
    homeUrl: category ? `${site}/c/${category}` : `${site}/`,
    selfUrl: `${site}${path}`,
    description: category
      ? `${CATEGORY_NAME[category]} items from primary Ethereum sources.`
      : "Primary Ethereum sources: client and tool releases, blogs, research and standards discussion.",
  };
}

/** "More:" and "Commentary:" as plain text lines, one link per line, for feed bodies. */
function storyText(s: Story): string {
  const block = (label: string, items: ItemRow[]) =>
    items.length ? [`${label}:`, ...items.map((i) => `${i.title} (${moreLabel(i)}) ${i.url}`)].join("\n") : "";
  return [block("More", s.more), block("Commentary", s.commentary)].filter(Boolean).join("\n\n");
}

/** Primary description followed by the story's other links; the title when both are empty. */
function feedBody(s: Story): string {
  return [s.primary.description, storyText(s)].filter(Boolean).join("\n\n") || s.primary.title;
}

function rssItem(s: Story): string {
  const i = s.primary;
  return `<item>
<title>${x(i.title)}</title>
<link>${x(i.url)}</link>
<guid isPermaLink="false">${x(i.key)}</guid>
<pubDate>${new Date(i.published_at).toUTCString()}</pubDate>
${authorName(i) ? `<dc:creator>${x(authorName(i)!)}</dc:creator>\n` : ""}<category>${x(categoryName(i.category))}</category>
<description>${x(feedBody(s))}</description>
</item>`;
}

/** "/feed.xml" and "/c/:slug/feed.xml": RSS 2.0, newest 50 stories, one entry each. */
export async function rssFeed(env: Env, category?: Category): Promise<Response> {
  const stories = await listStories(env.DB, { limit: FEED_LIMIT, category });
  const m = meta(env, category, category ? `/c/${category}/feed.xml` : "/feed.xml");
  const lastBuild = (stories[0] ? new Date(stories[0].primary.published_at) : new Date()).toUTCString();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
<title>${x(m.title)}</title>
<link>${x(m.homeUrl)}</link>
<description>${x(m.description)}</description>
<language>en</language>
<lastBuildDate>${lastBuild}</lastBuildDate>
<atom:link href="${x(m.selfUrl)}" rel="self" type="application/rss+xml"/>
${stories.map(rssItem).join("\n")}
</channel>
</rss>
`;
  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": PUBLIC_CACHE },
  });
}

/** "/feed.json": JSON Feed 1.1 of the same stories. */
export async function jsonFeed(env: Env, category?: Category): Promise<Response> {
  const stories = await listStories(env.DB, { limit: FEED_LIMIT, category });
  const m = meta(env, category, category ? `/c/${category}/feed.json` : "/feed.json");

  const feed = {
    version: "https://jsonfeed.org/version/1.1",
    title: m.title,
    home_page_url: m.homeUrl,
    feed_url: m.selfUrl,
    description: m.description,
    language: "en",
    items: stories.map((s) => {
      const i = s.primary;
      return {
        id: i.key,
        url: i.url,
        title: i.title,
        content_text: feedBody(s),
        ...(i.description ? { summary: i.description } : {}),
        date_published: i.published_at,
        ...(authorName(i) ? { authors: [{ name: authorName(i)! }] } : {}),
        tags: [categoryName(i.category)],
      };
    }),
  };
  return new Response(JSON.stringify(feed, null, 1), {
    headers: { "Content-Type": "application/feed+json; charset=utf-8", "Cache-Control": PUBLIC_CACHE },
  });
}
