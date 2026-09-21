import type { Metadata } from 'next';
import { GithubLink } from '../components/GithubLink';
import { GITHUB_URL } from '../site';
export const metadata: Metadata = { title: 'License · PHAROS' };
export default function License() {
  return <main className="container" style={{ maxWidth: 800, paddingBlock: 64 }}>
    <a href="/">← PHAROS</a><h1>Free software, self-hosted</h1>
    <p>Pharos is distributed under the GNU Affero General Public License, version 3. The complete license in the source repository governs use, modification and distribution.</p>
    <p><GithubLink kind="inline" href={`${GITHUB_URL}/blob/main/LICENSE`}>Read the license</GithubLink></p>
    <p>Pharos does not offer managed hosting, paid plans or hosted account registration.</p>
  </main>;
}
