/** Text helpers shared by the fetchers. No DOM, no dependencies. */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
};

/** Decode named and numeric HTML entities. Unknown named entities pass through. */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (m, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

/** Drop tags, decode entities, collapse whitespace. Good enough for feed summaries. */
export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]*>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** Clamp to `max` characters total, ending in an ellipsis when cut. */
export function truncate(text: string, max = 200): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + "…";
}

const TRACKING_PARAMS = /^(utm_|ref$|ref_|source$|mc_cid|mc_eid|fbclid|gclid)/;

/**
 * Canonical form of a URL for use as an identity: lowercase host, no hash,
 * no tracking params, no trailing slash. Returns the trimmed input if it
 * doesn't parse.
 */
export function normalizeUrl(input: string): string {
  const raw = input.trim();
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw;
  }
  u.hash = "";
  u.hostname = u.hostname.toLowerCase();
  for (const k of [...u.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(k)) u.searchParams.delete(k);
  }
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.slice(0, -1);
  }
  return u.toString();
}

/** Parse a date string; returns null instead of an Invalid Date. */
export function parseDate(s: string | undefined | null): Date | null {
  if (!s) return null;
  const d = new Date(String(s).trim());
  return isNaN(d.getTime()) ? null : d;
}
