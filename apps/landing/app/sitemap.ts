import type { MetadataRoute } from 'next';

const SITE_URL = 'https://ph-aros.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date('2026-07-02');
  return [
    {
      url: SITE_URL,
      lastModified,
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];
}
