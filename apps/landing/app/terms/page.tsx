import type { Metadata } from 'next';
import { GithubLink } from '../components/GithubLink';
import { InfoPage } from '../components/InfoPage';
import { GITHUB_URL } from '../site';

export const metadata: Metadata = { title: 'License · PHAROS' };

export default function License() {
  return (
    <InfoPage
      eyebrow="License"
      title="Free software, self-hosted"
      lead="PHAROS is distributed under the GNU Affero General Public License, version 3 (AGPL-3.0-only). The full license in the source repository governs use, modification and distribution."
      points={[
        { icon: 'code', color: 'var(--accent)', title: 'Use, study and change it', body: 'Run PHAROS for yourself, your household or your organisation, and adapt it to your needs.' },
        { icon: 'users', color: 'var(--cyan)', title: 'Share your changes', body: 'If you offer a modified version to others over a network, the AGPL asks you to make your source available to them too.' },
        { icon: 'shield', color: 'var(--purple)', title: 'No warranty, no paid plans', body: 'The software is provided as is. There is no managed hosting, paid tier or hosted account registration.' },
      ]}
    >
      <GithubLink className="btn btn-ghost" href={`${GITHUB_URL}/blob/main/LICENSE`}>Read the full license</GithubLink>
    </InfoPage>
  );
}
