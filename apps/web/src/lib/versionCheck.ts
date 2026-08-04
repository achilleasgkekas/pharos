/**
 * Self-host update-available check (P40).
 *
 * The release workflow already publishes versioned images to GHCR, but a self-hoster has
 * no way to learn a newer one exists short of watching the repo by hand: the container
 * they pulled in March happily runs forever. This is the consumption side of that
 * pipeline, and nothing more — a single anonymous GET to a public registry, no telemetry
 * leaving the instance, no auth, and a hard no-op when it fails (a firewalled instance
 * must not show an error the user cannot act on).
 *
 * Everything except the fetch is pure, so the comparison rules are pinned by tests.
 */

export type Version = { major: number; minor: number; patch: number };

/** Where this build came from. `dev` (the Dockerfile default) means "not a release". */
export function appVersion(): string {
  return (process.env.APP_VERSION || '').trim() || 'dev';
}

/**
 * Which package to compare against. A fork or a private rebuild pulls its own image, so
 * this is overridable; the default is the canonical published one.
 */
export function updateCheckRepo(): string {
  return (process.env.UPDATE_CHECK_IMAGE || '').trim() || 'achilleasgkekas/pharos';
}

export function releasesUrl(repo = updateCheckRepo()): string {
  return `https://github.com/${repo}/releases`;
}

/**
 * Strict `X.Y.Z` (with an optional leading `v`). Deliberately strict: the registry also
 * carries `latest`, `edge`, and the truncated `1` / `1.2` convenience tags the release
 * workflow pushes, and none of those are a version we can compare against. A pre-release
 * suffix is rejected too, so a `1.4.0-rc1` image never nags someone on stable 1.3.0.
 */
export function parseVersion(tag: string): Version | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec((tag || '').trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/** Standard semver ordering: negative when a < b, positive when a > b. */
export function compareVersions(a: Version, b: Version): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

/**
 * Highest real version among a registry tag list. Registry tag order is NOT version
 * order (the OCI spec sorts lexically, where 1.9.0 outranks 1.10.0), so this never
 * trusts position — it parses and takes the maximum.
 */
export function pickLatestVersion(tags: string[]): string | null {
  let best: Version | null = null;
  let bestTag: string | null = null;
  for (const tag of tags) {
    const v = parseVersion(tag);
    if (!v) continue;
    if (!best || compareVersions(v, best) > 0) {
      best = v;
      bestTag = tag.replace(/^v/, '');
    }
  }
  return bestTag;
}

/**
 * Is `latest` worth telling the user about? Answers NO when the running build is not a
 * release (`dev`, `edge`, a local build): someone running their own image has not "fallen
 * behind" and a banner nagging them to update to a version they may be ahead of is noise.
 */
export function isUpdateAvailable(current: string, latest: string | null): boolean {
  if (!latest) return false;
  const c = parseVersion(current);
  const l = parseVersion(latest);
  if (!c || !l) return false;
  return compareVersions(l, c) > 0;
}

/** How long a check result is trusted before another registry call is allowed. */
export const UPDATE_CHECK_TTL_MS = 24 * 60 * 60 * 1000;

export function checkIsDue(lastCheckedAt: Date | string | null, now = new Date()): boolean {
  if (!lastCheckedAt) return true;
  const t = new Date(lastCheckedAt).getTime();
  if (isNaN(t)) return true;
  return now.getTime() - t >= UPDATE_CHECK_TTL_MS;
}

const TAG_PAGE_SIZE = 100;
const MAX_TAG_PAGES = 5; // 500 tags ≈ 100+ releases; far past that, stop rather than loop
const FETCH_TIMEOUT_MS = 6000;

async function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Newest published version on GHCR, or null when it cannot be determined for ANY reason
 * (offline, firewalled, package private, registry down, unparseable answer). Never throws:
 * a failed update check must be invisible, not an error in the user's face.
 *
 * GHCR serves public packages to anonymous callers, but only after the standard registry
 * token dance: ask /token for a pull-scoped bearer, then call the v2 API with it.
 */
export async function fetchLatestVersion(repo = updateCheckRepo()): Promise<string | null> {
  try {
    const auth = (await getJson(
      `https://ghcr.io/token?scope=${encodeURIComponent(`repository:${repo}:pull`)}&service=ghcr.io`
    )) as { token?: string } | null;
    const token = auth?.token;
    if (!token) return null;

    const tags: string[] = [];
    let url: string | null = `https://ghcr.io/v2/${repo}/tags/list?n=${TAG_PAGE_SIZE}`;
    for (let page = 0; page < MAX_TAG_PAGES && url; page++) {
      const body = (await getJson(url, { Authorization: `Bearer ${token}` })) as { tags?: unknown } | null;
      const got = Array.isArray(body?.tags) ? (body.tags as unknown[]).map(String) : [];
      tags.push(...got);
      // Only keep paging while the registry fills a whole page; the Link header is the
      // spec'd cursor but GHCR omits it, so a short page means the end.
      url = got.length === TAG_PAGE_SIZE ? `https://ghcr.io/v2/${repo}/tags/list?n=${TAG_PAGE_SIZE}&last=${encodeURIComponent(got[got.length - 1])}` : null;
    }
    return pickLatestVersion(tags);
  } catch {
    return null; // offline / firewalled / DNS blocked — by design, say nothing
  }
}
