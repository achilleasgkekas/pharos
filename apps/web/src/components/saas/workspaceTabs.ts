// PURE + client-safe tab builder for the user-facing workspace-settings pages
// ((saas)/account/workspace/*). Each settings page renders the same WorkspaceShell tab bar so
// the panels (Overview / Members / …) link to one another while preserving the current
// `?w=<slug>` workspace selection. Kept pure (no DB, no next/*) so the link set is unit-testable
// and identical across pages. Only meaningful in SAAS_MODE.
import { normalizeSlug } from './chooseWorkspace';

/** Which settings panel is currently shown (drives the `active` flag). */
export type WorkspaceTabKey = 'overview' | 'members' | 'usage' | 'billing';

/** Structurally identical to WorkspaceShell's WorkspaceTab; declared locally so this pure
 *  helper (and its test) never pull the component module graph. */
export type WorkspaceTabLink = { href: string; label: string; active: boolean };

const TABS: readonly { key: WorkspaceTabKey; label: string; path: string }[] = [
  { key: 'overview', label: 'Overview', path: '/account/workspace' },
  { key: 'members', label: 'Members', path: '/account/workspace/members' },
  { key: 'usage', label: 'Usage', path: '/account/workspace/usage' },
  { key: 'billing', label: 'Billing', path: '/account/workspace/billing' },
] as const;

/**
 * Build the workspace-settings tab links, carrying the active `?w=` selection through so a
 * switch between panels stays on the same workspace. A blank/absent `wParam` yields clean URLs
 * (the default first-membership workspace); otherwise every tab gets `?w=<slug>` (URL-encoded,
 * lowercased — matching how pickWorkspace/the READ routes resolve a slug). Non-string `wParam`
 * is treated as absent.
 */
export function workspaceTabs(active: WorkspaceTabKey, wParam: unknown): WorkspaceTabLink[] {
  const slug = normalizeSlug(wParam);
  const q = slug ? `?w=${encodeURIComponent(slug)}` : '';
  return TABS.map((t) => ({
    href: `${t.path}${q}`,
    label: t.label,
    active: t.key === active,
  }));
}
