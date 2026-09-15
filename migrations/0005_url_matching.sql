-- Migration number: 0005
-- Stored item URLs from two feeds did not match how issues link them: the
-- Solidity feed doubles slashes ("soliditylang.org///blog/...") and the EF
-- feed links "/en/..." while the canonical has no locale prefix. Fix the
-- stored URLs (keys are guid-based and unchanged), then fill in newsletter
-- matches that were missed, comparing without "www." or a trailing slash.
UPDATE items SET url = 'https://' || replace(replace(substr(url, 9), '///', '/'), '//', '/')
  WHERE url LIKE 'https://%' AND substr(url, 9) LIKE '%//%';
UPDATE items SET url = replace(url, 'blog.ethereum.org/en/', 'blog.ethereum.org/')
  WHERE url LIKE '%blog.ethereum.org/en/%';
UPDATE newsletter_links SET item_key = (
    SELECT i.key FROM items i
    WHERE rtrim(replace(i.url, '://www.', '://'), '/') = rtrim(replace(newsletter_links.url, '://www.', '://'), '/')
    LIMIT 1)
  WHERE item_key IS NULL AND EXISTS (
    SELECT 1 FROM items i
    WHERE rtrim(replace(i.url, '://www.', '://'), '/') = rtrim(replace(newsletter_links.url, '://www.', '://'), '/'));
