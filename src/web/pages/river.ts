import type { Env } from "../../index";
import { CATEGORY_NAME, type Category } from "../../config/categories";
import { listPublished } from "../../db/items";
import { escapeHtml as h } from "../escape";
import { htmlResponse } from "../layout";
import { renderRiver } from "../render";

const RIVER_LIMIT = 100;

/** "/" and "/c/:slug": the newest 100 published items under running date headers. */
export async function riverPage(env: Env, category?: Category): Promise<Response> {
  const now = new Date();
  const items = await listPublished(env.DB, { limit: RIVER_LIMIT, category });
  const heading = category ? `<h1>${h(CATEGORY_NAME[category])}</h1>` : "";
  return htmlResponse(env, {
    title: category ? CATEGORY_NAME[category] : undefined,
    active: category,
    categoryFeed: category
      ? { href: `/c/${category}/feed.xml`, title: `${CATEGORY_NAME[category]} · ${env.SITE_NAME}` }
      : undefined,
    body: heading + renderRiver(items, now),
  });
}
