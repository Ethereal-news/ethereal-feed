-- Migration number: 0004
-- Three release repos moved on GitHub; the owner is part of the item key, so
-- rename stored keys to the new owner to avoid re-emitting recent releases.
-- If the new code already ran and inserted new-owner rows, drop the old-owner
-- duplicates first so the rename cannot hit the UNIQUE key constraint.
DELETE FROM items WHERE key LIKE 'release:ledgerwatch/erigon:%' AND replace(key, 'release:ledgerwatch/erigon:', 'release:erigontech/erigon:') IN (SELECT key FROM items);
DELETE FROM items WHERE key LIKE 'release:prysmaticlabs/prysm:%' AND replace(key, 'release:prysmaticlabs/prysm:', 'release:OffchainLabs/prysm:') IN (SELECT key FROM items);
DELETE FROM items WHERE key LIKE 'release:ethereum/solidity:%' AND replace(key, 'release:ethereum/solidity:', 'release:argotorg/solidity:') IN (SELECT key FROM items);
UPDATE items SET key = replace(key, 'release:ledgerwatch/erigon:', 'release:erigontech/erigon:') WHERE key LIKE 'release:ledgerwatch/erigon:%';
UPDATE items SET key = replace(key, 'release:prysmaticlabs/prysm:', 'release:OffchainLabs/prysm:') WHERE key LIKE 'release:prysmaticlabs/prysm:%';
UPDATE items SET key = replace(key, 'release:ethereum/solidity:', 'release:argotorg/solidity:') WHERE key LIKE 'release:ethereum/solidity:%';
UPDATE newsletter_links SET item_key = replace(item_key, 'release:ledgerwatch/erigon:', 'release:erigontech/erigon:') WHERE item_key LIKE 'release:ledgerwatch/erigon:%';
UPDATE newsletter_links SET item_key = replace(item_key, 'release:prysmaticlabs/prysm:', 'release:OffchainLabs/prysm:') WHERE item_key LIKE 'release:prysmaticlabs/prysm:%';
UPDATE newsletter_links SET item_key = replace(item_key, 'release:ethereum/solidity:', 'release:argotorg/solidity:') WHERE item_key LIKE 'release:ethereum/solidity:%';
