/**
 * Per-item title fixes, by item key, for typos a source has yet to correct.
 * Applied on every fetch, so the fix survives the refetch that would
 * otherwise restore the feed's title. Drop an entry once the source fixes it.
 */
export const TITLE_FIXES: Record<string, string> = {
  "rss:seal-radar:6acd26ccf65c010001ea2fbc": "Q3 2026 Threat Intel Summary",
};
