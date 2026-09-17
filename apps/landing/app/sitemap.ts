import type { MetadataRoute } from 'next';

const SITE_URL = 'https://ph-aros.com';

export default function sitemap(): MetadataRoute.Sitemap {
  // Stamped at build time so the sitemap never advertises a stale date.
  const lastModified = new Date();
  return [
    {
      url: SITE_URL,
      lastModified,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      // /status is indexable (unlike /privacy and /terms, which are deliberately noindex) and it
      // was reachable from nowhere: not in here, not linked from the page. An orphan page is one
      // no search engine and no visitor ever finds.
      url: `${SITE_URL}/status`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.5,
    },
  ];
}
