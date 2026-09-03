import type { Env } from "../index";
import { CATEGORIES } from "../config/categories";
import { escapeHtml as h } from "./escape";
import { CSS } from "./styles";

export const PUBLIC_CACHE = "public, max-age=300";

export interface PageOpts {
  /** Page-specific part of <title>; the site name is appended. */
  title?: string;
  body: string;
  /** Category slug to highlight in the nav. */
  active?: string;
  /** Per-category feed, advertised alongside the main one. */
  categoryFeed?: { href: string; title: string };
}

// Runs before first paint so a stored preference never flashes the other theme.
const THEME_BOOT = `(function(){try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})();`;

// Cycles system -> light -> dark. "system" removes the key so prefers-color-scheme applies.
const THEME_TOGGLE = `(function(){var b=document.getElementById("theme");if(!b)return;var r=document.documentElement;function cur(){try{var t=localStorage.getItem("theme");return t==="light"||t==="dark"?t:"system"}catch(e){return"system"}}function show(m){b.textContent="theme: "+m;b.setAttribute("aria-label","Theme: "+m+". Activate to change.")}show(cur());b.addEventListener("click",function(){var n={system:"light",light:"dark",dark:"system"}[cur()];try{if(n==="system")localStorage.removeItem("theme");else localStorage.setItem("theme",n)}catch(e){}if(n==="system")r.removeAttribute("data-theme");else r.setAttribute("data-theme",n);show(n)})})();`;

export function layout(env: Env, o: PageOpts): string {
  const siteName = env.SITE_NAME;
  const title = o.title ? `${o.title} · ${siteName}` : siteName;
  const feedHref = o.categoryFeed?.href ?? "/feed.xml";

  const nav = CATEGORIES.map(
    (c) => `<a href="/c/${c.slug}"${o.active === c.slug ? ' aria-current="page"' : ""}>${h(c.name)}</a>`
  ).join("\n");

  const feedLinks = [
    `<link rel="alternate" type="application/rss+xml" title="${h(siteName)}" href="/feed.xml">`,
    `<link rel="alternate" type="application/feed+json" title="${h(siteName)}" href="/feed.json">`,
    o.categoryFeed
      ? `<link rel="alternate" type="application/rss+xml" title="${h(o.categoryFeed.title)}" href="${h(o.categoryFeed.href)}">`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h(title)}</title>
${feedLinks}
<script>${THEME_BOOT}</script>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
<header>
<div class="brand"><a href="https://ethereal.news">Ethereal news</a><span class="sep">/</span><a class="feed" href="/">feed</a></div>
<div class="tools"><a href="${h(feedHref)}" title="RSS">RSS</a><button id="theme" type="button">theme</button></div>
<nav class="cats" aria-label="Categories">
${nav}
</nav>
</header>
<main>
${o.body}
</main>
<footer><span>Primary sources only.</span><a href="/sources">Sources</a><a href="/feed.xml">RSS</a><a href="/feed.json">JSON</a></footer>
</div>
<script>${THEME_TOGGLE}</script>
</body>
</html>
`;
}

/** Render a page with the shared shell and public cache headers. */
export function htmlResponse(env: Env, o: PageOpts, status = 200): Response {
  return new Response(layout(env, o), {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": PUBLIC_CACHE,
    },
  });
}

export function notFound(env: Env, what = "page"): Response {
  return htmlResponse(
    env,
    {
      title: "Not found",
      body: `<h1>Not found</h1><p class="muted">No such ${h(what)}. <a href="/">Back to the feed.</a></p>`,
    },
    404
  );
}
