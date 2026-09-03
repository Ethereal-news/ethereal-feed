-- Migration number: 0002
-- Links that appeared in ethereal.news issues, matched back to sources and items.
CREATE TABLE newsletter_links (
  issue_url   TEXT NOT NULL,        -- canonical issue URL on ethereal.news
  issue_date  TEXT NOT NULL,        -- YYYY-MM-DD from the issue
  url         TEXT NOT NULL,        -- normalized link as it appeared
  source_id   TEXT,                 -- matched source, NULL if none
  item_key    TEXT,                 -- matched items.key, NULL if none
  PRIMARY KEY (issue_url, url)
);
CREATE INDEX nl_src ON newsletter_links (source_id);
CREATE INDEX nl_item ON newsletter_links (item_key);
