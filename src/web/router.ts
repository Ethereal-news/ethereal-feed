import type { Env } from "../index";
import { isCategory } from "../config/categories";
import { jsonFeed, rssFeed } from "./feeds";
import { notFound } from "./layout";
import { dayPage } from "./pages/day";
import { draftMarkdownResponse, draftPage } from "./pages/draft";
import { attachToStory, hidePendingItem, pendingPage, splitFromStory } from "./pages/pending";
import { riverPage } from "./pages/river";
import { sourcesPage } from "./pages/sources";
import { weekPage, weekRedirect } from "./pages/week";

/** Public routes (PLAN §6). /health is handled in index.ts. */
export async function handleWeb(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;

  // POSTs are the review queue's forms: hide, attach a URL to a story, split one out.
  if (request.method === "POST") {
    if (path === "/pending/hide") return hidePendingItem(request, env);
    if (path === "/pending/attach") return attachToStory(request, env);
    if (path === "/pending/split") return splitFromStory(request, env);
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }

  if (path === "/") return riverPage(env);
  if (path === "/feed.xml") return rssFeed(env);
  if (path === "/feed.json") return jsonFeed(env);
  if (path === "/sources") return sourcesPage(env);
  if (path === "/pending") return pendingPage(env);
  if (path === "/draft") return draftPage(request, env);
  if (path === "/draft.md") return draftMarkdownResponse(request, env);

  let m: RegExpMatchArray | null;
  if ((m = path.match(/^\/c\/([a-z0-9-]+)\/feed\.xml$/))) {
    return isCategory(m[1]) ? rssFeed(env, m[1]) : notFound(env, "category");
  }
  if ((m = path.match(/^\/c\/([a-z0-9-]+)\/?$/))) {
    return isCategory(m[1]) ? riverPage(env, m[1]) : notFound(env, "category");
  }
  if ((m = path.match(/^\/day\/([0-9-]+)\/?$/))) {
    return dayPage(env, m[1]);
  }
  if (path === "/week" || path === "/week/") return weekRedirect();
  if ((m = path.match(/^\/week\/([0-9-]+)\/?$/))) {
    return weekPage(env, m[1]);
  }
  return notFound(env);
}
