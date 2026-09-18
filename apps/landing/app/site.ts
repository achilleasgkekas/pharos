// Shared marketing-site constants. The repo is private during the beta, so every GitHub-facing
// link or reference must gate on REPO_PUBLIC — a link straight to a private repo is a 404 for
// every visitor (issue #157). Links go through <GithubLink> (app/components/GithubLink.tsx), which
// renders text or an inert "soon" control while this is false and a real link once it is true.
// Flipping REPO_PUBLIC to true is the whole release switch: nothing else needs editing.
export const GITHUB_URL = 'https://github.com/achilleasgkekas/pharos';
export const REPO_PUBLIC = false;
