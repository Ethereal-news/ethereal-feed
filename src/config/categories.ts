/**
 * Newsletter sections, in the order ethereal.news prints them.
 * Slugs are stored on items and used in URLs (/c/:slug).
 */
export const CATEGORIES = [
  { slug: "ecosystem",    name: "Ecosystem" },
  { slug: "enterprise",   name: "Enterprise" },
  { slug: "applications", name: "Applications" },
  { slug: "developers",   name: "Developers" },
  { slug: "security",     name: "Security" },
  { slug: "layer-1",      name: "Layer 1" },
  { slug: "staking",      name: "Staking" },
  { slug: "layer-2",      name: "Layer 2" },
  { slug: "regulation",   name: "Regulation" },
  { slug: "general",      name: "General" },
] as const;

export type Category = (typeof CATEGORIES)[number]["slug"];

export const CATEGORY_NAME: Record<Category, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.slug, c.name])
) as Record<Category, string>;

export function isCategory(s: string): s is Category {
  return CATEGORIES.some((c) => c.slug === s);
}
