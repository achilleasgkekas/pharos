import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { GITHUB_URL } from '../site';

type GithubLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'target' | 'rel'> & {
  href?: string;
  children: ReactNode;
};

/** A link into the public repository, opened in a new tab. */
export function GithubLink({ href = GITHUB_URL, children, ...rest }: GithubLinkProps) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
      {children}
    </a>
  );
}
