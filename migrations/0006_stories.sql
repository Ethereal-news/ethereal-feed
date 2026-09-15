-- Migration number: 0006
-- Story clustering: items that are about the same thing (a release and the
-- blog post announcing it, a forum topic and the posts discussing it) share a
-- story. One item per story is primary; the rest are "more" (further
-- coverage) or "commentary" (forum discussion). fetch/cluster.ts assigns them.
CREATE TABLE stories (
  id              INTEGER PRIMARY KEY,
  primary_item_id INTEGER NOT NULL REFERENCES items(id),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
ALTER TABLE items ADD COLUMN story_id INTEGER REFERENCES stories(id);
ALTER TABLE items ADD COLUMN story_role TEXT NOT NULL DEFAULT 'primary';
  -- primary | more | commentary
CREATE INDEX items_story ON items (story_id);

-- http(s) links found in an item's body (release notes, feed entry content,
-- forum first post), in the comparison form newsletter.ts uses. Cross-links
-- between items are the strongest clustering signal.
CREATE TABLE outbound_links (
  item_id INTEGER NOT NULL REFERENCES items(id),
  url     TEXT NOT NULL,
  PRIMARY KEY (item_id, url)
);
CREATE INDEX ol_url ON outbound_links (url);

-- No backfill here: the first cron run after this migration clusters every
-- published item that has no story (fetch/cluster.ts), so items that were
-- already in the table can still collapse into shared stories. A story's id
-- is the id of the item that founded it.
