import { GithubLink } from '../components/GithubLink';
import { GITHUB_URL, REPO_PUBLIC } from '../site';
export const metadata = { title: 'Project status · PHAROS' };
export default function Status() {
  return <main className="container" style={{ maxWidth: 800, paddingBlock: 64 }}>
    <a href="/">← PHAROS</a><h1>Project status</h1>
    <p>Pharos is developed as a self-hosted personal hub. The managed hosted product has been retired.</p>
    <p>{REPO_PUBLIC ? 'Source code and development activity are available in the public repository.' : 'The public source release is being prepared.'}</p>
    <GithubLink kind="button" href={`${GITHUB_URL}/releases`}>Releases</GithubLink>
  </main>;
}
