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
  ];
}
