// Shared marketing-site constants. The repo is private during the beta, so every
// GitHub-facing link or reference must gate on REPO_PUBLIC — a link straight to a
// private repo is a 404 for every visitor (issue #157). Flip REPO_PUBLIC to true the
// moment the repo goes public; the <GithubLink> component below and every JSON-LD
// reference that checks this flag drop the "soon" state automatically.
export const GITHUB_URL = 'https://github.com/achilleasgkekas/pharos';
export const REPO_PUBLIC = false;
