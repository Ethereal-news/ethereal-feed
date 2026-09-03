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

// Theme cycles system -> light -> dark; "system" removes the key so prefers-color-scheme
// applies. The icon swap is CSS-only (see styles.ts). "Back to top" scrolls the window.
const CLIENT_JS = `(function(){var b=document.getElementById("theme");var r=document.documentElement;function cur(){try{var t=localStorage.getItem("theme");return t==="light"||t==="dark"?t:"system"}catch(e){return"system"}}function label(m){b.setAttribute("aria-label","Theme: "+m+". Activate to change.");b.title="Theme: "+m}if(b){label(cur());b.addEventListener("click",function(){var n={system:"light",light:"dark",dark:"system"}[cur()];try{if(n==="system")localStorage.removeItem("theme");else localStorage.setItem("theme",n)}catch(e){}if(n==="system")r.removeAttribute("data-theme");else r.setAttribute("data-theme",n);label(n)})}var t=document.getElementById("top");if(t)t.addEventListener("click",function(){window.scrollTo({top:0,behavior:"smooth"})})})();`;

// ethereal.news logo, 20x20, currentColor.
const LOGO = `<svg class="logo" width="20" height="20" viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M198.437 230.803L192.397 74.3046L288.924 87.7973L343.772 168.391L198.437 230.803Z" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><path d="M198 229.318C198 229.318 177.841 275.616 112.884 262.174C68.4941 252.989 52.3468 284.95 46.5733 306.112C44.5251 314.009 43.6916 322.171 44.1015 330.318" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const ICON_ATTRS = `width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;
const MOON = `<svg class="moon" ${ICON_ATTRS}><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;
const SUN = `<svg class="sun" ${ICON_ATTRS}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`;
const ARROW_UP = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>`;
const RSS = `<svg ${ICON_ATTRS}><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>`;
const X_LOGO = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`;
const GITHUB = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>`;

export function layout(env: Env, o: PageOpts): string {
  const siteName = env.SITE_NAME;
  const title = o.title ? `${o.title} · ${siteName}` : siteName;
  const year = new Date().getUTCFullYear();

  const cats = CATEGORIES.map(
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
<div class="bar">
<div class="brand">
<a class="home" href="https://ethereal.news">${LOGO}<span>Ethereal news</span></a>
<span class="sub"><span class="sep">/</span><a href="/">feed</a></span>
</div>
<nav class="top" aria-label="Site">
<a href="https://ethereal.news">newsletter</a>
<a href="/sources">sources</a>
<button id="theme" type="button" aria-label="Theme">${MOON}${SUN}</button>
</nav>
</div>
<nav class="cats" aria-label="Categories">
${cats}
</nav>
</header>
<main>
${o.body}
</main>
<footer>
<p class="note">Primary sources only.</p>
<div class="row">
<span>© ${year} • Ethereal news</span>
<button id="top" type="button" class="pill">${ARROW_UP}Back to top</button>
</div>
<div class="icons">
<a href="https://x.com/EtherealnewsHQ" aria-label="Ethereal news on X" rel="noopener">${X_LOGO}</a>
<a href="https://github.com/Ethereal-news/ethereal-feed" aria-label="Source code on GitHub" rel="noopener">${GITHUB}</a>
<a href="/feed.xml" aria-label="RSS feed">${RSS}</a>
</div>
</footer>
</div>
<script>${CLIENT_JS}</script>
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
