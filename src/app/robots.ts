import type { MetadataRoute } from 'next';
import { cmsConfigured } from '@/lib/cms';
import { siteUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';
export default function robots(): MetadataRoute.Robots {
  const indexable = process.env.SITE_INDEXABLE === 'true' && cmsConfigured();
  return { rules: { userAgent: '*', ...(indexable ? { allow: '/', disallow: ['/admin', '/api', '/ar/search', '/en/search'] } : { disallow: '/' }) }, ...(indexable ? { sitemap: `${siteUrl}/sitemap.xml` } : {}) };
}