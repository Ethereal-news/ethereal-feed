-- Migration number: 0007
-- Base's feed moved its links from base.org to www.base.org (guid = link), so
-- the rekey, which then compared URLs exactly, missed them and the four posts
-- still in the 14-day window were inserted again at fetch time (866-869).
-- Drop the duplicates and their single-item stories, and move the originals
-- (753, 806, 812, 824) to the new keys and URLs, keeping their dates and stories.
UPDATE items SET story_id = NULL WHERE id IN (866, 867, 868, 869);
DELETE FROM stories WHERE id IN (541, 542, 543, 544) AND primary_item_id IN (866, 867, 868, 869);
DELETE FROM outbound_links WHERE item_id IN (866, 867, 868, 869);
DELETE FROM items WHERE id IN (866, 867, 868, 869) AND source_id = 'base-engineering-blog';
UPDATE items SET
    key = replace(key, '://base.org/', '://www.base.org/'),
    url = replace(url, '://base.org/', '://www.base.org/')
  WHERE id IN (753, 806, 812, 824) AND source_id = 'base-engineering-blog';
