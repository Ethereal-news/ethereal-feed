import type { Env } from "../../index";
import { CATEGORY_NAME, type Category } from "../../config/categories";
import { listStories, newsletterAppearances } from "../../db/items";
import { escapeHtml as h } from "../escape";
import { describe, htmlResponse } from "../layout";
import { latestIssue, renderIssueEntry } from "../newsletter";
import { renderRiver, storyKeys } from "../render";

const RIVER_LIMIT = 100;

/**
 * "/" and "/c/:slug": the newest 100 published stories under running date headers.
 * The main river also carries the latest Ethereal news issue on its publish day.
 */
export async function riverPage(env: Env, category?: Category): Promise<Response> {
  const now = new Date();
  const [stories, issue] = await Promise.all([
    listStories(env.DB, { limit: RIVER_LIMIT, category }),
    category ? Promise.resolve(null) : latestIssue(env.DB),
  ]);
  const issues = await newsletterAppearances(env.DB, storyKeys(stories));
  const inline = issue ? { published_at: issue.published_at, html: renderIssueEntry(issue, now) } : undefined;
  const heading = category ? `<h1>${h(CATEGORY_NAME[category])}</h1>` : "";
  const name = category ? CATEGORY_NAME[category] : undefined;
  return htmlResponse(env, {
    title: name ? `Ethereum ${name} news feed` : "Ethereum news feed",
    description: describe(name ? `Ethereum ${name} news` : "Ethereum news"),
    path: category ? `/c/${category}` : "/",
    active: category,
    categoryFeed: category
      ? { href: `/c/${category}/feed.xml`, title: `${env.SITE_NAME} ${name} RSS` }
      : undefined,
    body: heading + renderRiver(stories, now, issues, inline),
  });
}
