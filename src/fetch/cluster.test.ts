import { test } from "node:test";
import assert from "node:assert/strict";
import { groupPair, rank, type Row } from "./cluster";

const row = (r: Partial<Row>): Row => ({
  id: 1,
  url: "https://example.com/",
  title: "",
  description: "",
  source_id: "solidity-blog",
  source_type: "rss",
  version: null,
  status: "published",
  published_at: "2026-10-22T10:00:00Z",
  story_id: null,
  story_role: "primary",
  ...r,
});

const announcement = row({
  id: 1,
  title: "Solidity 0.8.38 Release Announcement",
  description: "Solidity v0.8.38 is out. This release fixes a low-severity bug in the Yul optimizer.",
});
const bug = row({
  id: 2,
  title: "Yul Optimizer Knowledge Base Stale Bookkeeping Bug",
  description: "On August 17, 2026, Daniel Boye reported a bug in the Yul optimizer through the bug bounty program.",
  published_at: "2026-10-22T10:05:00Z",
});
const release = row({ id: 3, source_id: "solidity", source_type: "release", title: "Solidity v0.8.38", version: "0.8.38" });

test("a bug post joins its group's release announcement and release", () => {
  assert.ok(groupPair(bug, announcement));
  assert.ok(groupPair(bug, release));
  assert.ok(groupPair(release, bug));
});

test("the announcement, not the bug post, is primary", () => {
  assert.ok(rank(announcement) < rank(bug));
});

test("a bug post stays alone outside the group window", () => {
  assert.ok(!groupPair({ ...bug, published_at: "2026-10-26T10:00:00Z" }, announcement));
});

test("a same-group blog post that is neither a bug post nor an announcement stays alone", () => {
  assert.ok(!groupPair(row({ id: 4, title: "Solidity Summit recap", description: "Talks from the summit." }), release));
});

test("a bug post from another group stays alone", () => {
  assert.ok(!groupPair({ ...bug, source_id: "vyper-blog" }, announcement));
});
