/** Thin fetch wrappers: one timeout, one User-Agent, throw on non-2xx. */

export const USER_AGENT = "ethereal-feed (+https://feed.ethereal.news)";
export const TIMEOUT_MS = 10_000;

/** Longest we will wait before the single retry, whatever Retry-After says. */
const MAX_RETRY_DELAY_MS = 20_000;

function retryDelay(res: Response): number {
  const ra = Number(res.headers.get("retry-after"));
  const wanted = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 8_000 + Math.random() * 4_000;
  return Math.min(wanted, MAX_RETRY_DELAY_MS);
}

/**
 * GET with one retry on 429 or 5xx. Worker egress IPs are shared, so hosts with
 * per-IP rate limits (Substack, Paragraph, anything behind a Cloudflare rate
 * rule) sometimes 429 the first request at the top of the hour when every cron
 * on the platform fires at once; a few seconds later the same request succeeds.
 */
async function get(url: string, headers: Record<string, string>): Promise<Response> {
  const init: RequestInit = { headers: { "User-Agent": USER_AGENT, ...headers } };
  let res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 429 || res.status >= 500) {
    await new Promise((r) => setTimeout(r, retryDelay(res)));
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res;
}

export async function fetchText(url: string, headers: Record<string, string> = {}): Promise<string> {
  return (await get(url, headers)).text();
}

export async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  return (await get(url, { Accept: "application/json", ...headers })).json() as Promise<T>;
}

/** GitHub REST headers; token is optional (60 req/h unauthenticated). */
export function githubHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}
