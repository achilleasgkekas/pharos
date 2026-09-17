import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { GITHUB_URL, REPO_PUBLIC } from '../site';

type GithubLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'target' | 'rel'> & {
  href?: string;
  children: ReactNode;
};

// Renders a real link to the repo once REPO_PUBLIC flips true; until then, inert text
// carrying the same classes/style, so nothing on the marketing site points a visitor at
// a repo that returns 404 (issue #157). `href` defaults to the repo root but accepts a
// sub-path (e.g. `${GITHUB_URL}/issues`) for the handful of callers that link deeper.
export function GithubLink({ href = GITHUB_URL, children, ...rest }: GithubLinkProps) {
  if (!REPO_PUBLIC) {
    return <span {...rest}>{children}</span>;
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
      {children}
    </a>
  );
}
