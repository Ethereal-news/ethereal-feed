import type { Env } from "../../index";
import { CATEGORY_NAME, type Category } from "../../config/categories";
import { listStories, newsletterAppearances } from "../../db/items";
import { escapeHtml as h } from "../escape";
import { describe, htmlResponse } from "../layout";
import { renderRiver, storyKeys } from "../render";

const RIVER_LIMIT = 100;

/** "/" and "/c/:slug": the newest 100 published stories under running date headers. */
export async function riverPage(env: Env, category?: Category): Promise<Response> {
  const now = new Date();
  const stories = await listStories(env.DB, { limit: RIVER_LIMIT, category });
  const issues = await newsletterAppearances(env.DB, storyKeys(stories));
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
    body: heading + renderRiver(stories, now, issues),
  });
}
