import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { GITHUB_URL, REPO_PUBLIC } from '../site';

type GithubLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'target' | 'rel'> & {
  href?: string;
  /**
   * How this link is presented, and therefore what it degrades INTO while the repo is private:
   *  - `inline` sits inside a sentence → plain text. Link styling (className/style) is DROPPED,
   *    because text that still looks like a link is the bug this component exists to prevent;
   *  - `button` looks clickable → keeps its button shape but carries a "soon" badge and
   *    aria-disabled, so it reads as "not yet" rather than "broken".
   *
   * Required on purpose: the first version left the badge to the caller and two buttons shipped
   * without it (reviews of PR #160). A required prop is what the next caller cannot forget.
   */
  kind: 'inline' | 'button';
  children: ReactNode;
};

/** A link to the repo once REPO_PUBLIC flips true; until then it never points at a 404 (#157). */
export function GithubLink({ href = GITHUB_URL, kind, children, className, style, ...rest }: GithubLinkProps) {
  if (!REPO_PUBLIC) {
    if (kind === 'inline') {
      // No className, no style, no onClick: the words stay, every affordance of a link goes.
      return <span>{children}</span>;
    }
    return (
      <span {...rest} className={className} style={style} aria-disabled>
        {children}
        <span className="soon-badge">soon</span>
      </span>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} style={style} {...rest}>
      {children}
    </a>
  );
}
