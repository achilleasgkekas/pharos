import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { GITHUB_URL, REPO_PUBLIC } from '../site';

type GithubLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'target' | 'rel'> & {
  href?: string;
  /**
   * How this link is presented, and therefore what it must degrade INTO while the repo is private:
   *  - `inline` sits inside a sentence, so it degrades to plain text and nothing else is needed;
   *  - `button` looks clickable, so it degrades to an inert control that SAYS it is not ready yet.
   *
   * Required on purpose. The first version left the "soon" badge to the caller, and the two buttons
   * on /privacy and /terms shipped without it: a button that looks live and does nothing (review of
   * PR #160). A required prop is a thing the compiler will not let the next caller forget.
   */
  kind: 'inline' | 'button';
  children: ReactNode;
};

/** A link to the repo once REPO_PUBLIC flips true; until then it never points at a 404 (#157). */
export function GithubLink({ href = GITHUB_URL, kind, children, ...rest }: GithubLinkProps) {
  if (!REPO_PUBLIC) {
    return (
      <span {...rest} aria-disabled={kind === 'button' ? true : undefined}>
        {children}
        {kind === 'button' && <span className="soon-badge">soon</span>}
      </span>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
      {children}
    </a>
  );
}
