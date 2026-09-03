const MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escape for HTML text and attribute values. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => MAP[c]);
}

/** Characters XML 1.0 allows: tab, LF, CR, and everything printable outside the surrogate range. */
function isXmlChar(code: number): boolean {
  return (
    code === 9 ||
    code === 10 ||
    code === 13 ||
    (code >= 32 && code <= 0xd7ff) ||
    (code >= 0xe000 && code <= 0xfffd) ||
    code >= 0x10000
  );
}

/** Escape for XML text and attributes; also drops control characters XML 1.0 forbids. */
export function escapeXml(value: unknown): string {
  let out = "";
  for (const ch of String(value ?? "")) {
    if (!isXmlChar(ch.codePointAt(0)!)) continue;
    out += MAP[ch] ?? ch;
  }
  return out;
}
