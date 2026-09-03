/**
 * Backfill newsletter_links from every ethereal.news issue.
 *
 *   npx tsx scripts/backfill-newsletter.ts [out.sql]
 *
 * Runs locally, not in the Worker. Reads the item index from the LOCAL D1
 * database via wrangler, so run `npm run dev` / migrations first. Writes an
 * SQL file of INSERT OR IGNORE statements (default /tmp/newsletter-backfill.sql)
 * and prints a summary. Apply with:
 *   npx wrangler d1 execute ethereal-feed --local  --file /tmp/newsletter-backfill.sql
 *   npx wrangler d1 execute ethereal-feed --remote --file /tmp/newsletter-backfill.sql
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import {
  NEWSLETTER_ARCHIVE,
  buildItemIndex,
  issueMarkdownUrl,
  listIssues,
  parseIssue,
  toRows,
  type NewsletterRow,
} from "../src/fetch/newsletter";
import { fetchText } from "../src/fetch/http";

const out = process.argv[2] ?? "/tmp/newsletter-backfill.sql";

function sql(v: string | null): string {
  return v === null ? "NULL" : `'${v.replace(/'/g, "''")}'`;
}

/** Issue URLs linked from the archive page, in case the RSS is capped. */
async function archiveIssues(): Promise<string[]> {
  const html = await fetchText(NEWSLETTER_ARCHIVE, { Accept: "text/html" });
  const urls = new Set<string>();
  for (const m of html.matchAll(/href="(\/ethereal-news-weekly-\d+\/?)"/g)) {
    urls.add(new URL(m[1].replace(/\/?$/, "/"), NEWSLETTER_ARCHIVE).toString());
  }
  return [...urls];
}

async function main() {
  const fromRss = await listIssues();
  const known = new Set(fromRss.map((i) => i.url));
  const extra = (await archiveIssues()).filter((u) => !known.has(u));
  const issues = [...fromRss, ...extra.map((url) => ({ url, date: "" }))];
  console.log(`issues: ${fromRss.length} from RSS, ${extra.length} extra from archive`);

  const raw = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", "ethereal-feed", "--local", "--json", "--command", "SELECT key, url FROM items"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
  );
  const rows = JSON.parse(raw.slice(raw.indexOf("[")))[0].results as Array<{ key: string; url: string }>;
  const index = buildItemIndex(rows);
  console.log(`item index: ${rows.length} rows`);

  const all: NewsletterRow[] = [];
  let processed = 0;
  for (const issue of issues) {
    let markdown: string;
    try {
      markdown = await fetchText(issueMarkdownUrl(issue.url), { Accept: "text/markdown, text/plain;q=0.9, */*;q=0.8" });
    } catch (e) {
      console.error(`skip ${issue.url}: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    const links = parseIssue(markdown, issue.url, issue.date || undefined);
    all.push(...toRows(links, index));
    processed++;
    await new Promise((r) => setTimeout(r, 200));
  }

  const lines = all.map(
    (r) =>
      `INSERT OR IGNORE INTO newsletter_links (issue_url, issue_date, url, source_id, item_key) VALUES (${sql(r.issue_url)}, ${sql(r.issue_date)}, ${sql(r.url)}, ${sql(r.source_id)}, ${sql(r.item_key)});`
  );
  writeFileSync(out, lines.join("\n") + "\n");

  const withSource = all.filter((r) => r.source_id).length;
  const withItem = all.filter((r) => r.item_key).length;
  console.log(`issues processed: ${processed}`);
  console.log(`links found: ${all.length}`);
  console.log(`links matched to a source: ${withSource}`);
  console.log(`links matched to an item: ${withItem}`);
  console.log(`wrote ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
