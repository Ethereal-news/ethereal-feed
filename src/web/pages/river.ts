import type { Env } from "../../index";
import { CATEGORY_NAME, type Category } from "../../config/categories";
import { listPublished, newsletterAppearances } from "../../db/items";
import { escapeHtml as h } from "../escape";
import { describe, htmlResponse } from "../layout";
import { renderRiver } from "../render";

const RIVER_LIMIT = 100;

/** "/" and "/c/:slug": the newest 100 published items under running date headers. */
export async function riverPage(env: Env, category?: Category): Promise<Response> {
  const now = new Date();
  const items = await listPublished(env.DB, { limit: RIVER_LIMIT, category });
  const issues = await newsletterAppearances(env.DB, items.map((i) => i.key));
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
    body: heading + renderRiver(items, now, issues),
  });
}
