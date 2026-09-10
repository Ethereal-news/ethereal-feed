-- Migration number: 0003
-- Discourse display name (from /latest.json), shown instead of the username when set.
-- `author` stays the username: trustedAuthors allowlists match on it.
ALTER TABLE items ADD COLUMN author_name TEXT;
