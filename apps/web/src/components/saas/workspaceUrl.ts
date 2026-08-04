// Where a workspace's ACTUAL PRODUCT lives: `https://<slug>.<base domain>`.
//
// WHY THIS EXISTS: the SaaS account area (signup, workspace settings, billing, /admin) is served
// from `app.<domain>`, while the app a customer signed up to use is on their own subdomain. Until
// this helper there was no link between the two ANYWHERE in the UI — so a new customer completed
// signup, landed in workspace settings, and had no door into Pharos at all. Reported as "I signed
// up and I can't get in, I only see settings", which is exactly what it looked like.
//
// PURE (base URL injected), so it can be unit-tested without a request and reused wherever a
// workspace is named.

/**
 * Swap the host's first label for the workspace slug, keeping scheme and port.
 *
 * Deriving it from the app's own public URL rather than assembling
 * `https://` + slug + `.` + domain is deliberate: the port and the scheme then come along for
 * free, so a non-standard port (any local or staging deployment) produces a link that actually
 * works instead of one that quietly drops the port and 404s on the apex.
 *
 * Falls back to a root-relative link when no base URL is configured. A relative link stays on the
 * host the user is already on, which is wrong-but-harmless, whereas a malformed absolute URL
 * sends them off-site.
 */
export function workspaceUrl(slug: string, publicUrl: string | null | undefined): string {
  const s = (slug || '').trim().toLowerCase();
  if (!s) return '/';
  const base = (publicUrl || '').trim();
  if (!base) return '/';

  try {
    const u = new URL(base);
    const host = u.hostname;
    const labels = host.split('.');
    // `app.ph-aros.com` → replace `app`. A bare `lvh.me` or `example.com` has nothing to replace,
    // so prepend instead — otherwise the workspace label would eat the domain itself.
    const rest = labels.length > 2 ? labels.slice(1) : labels;
    u.hostname = [s, ...rest].join('.');
    // Always the workspace root: this is "open the app", not "resume where you were".
    u.pathname = '/';
    u.search = '';
    u.hash = '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return '/';
  }
}
