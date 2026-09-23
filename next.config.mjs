import { withPayload } from '@payloadcms/next/withPayload';

/** @type {import('next').NextConfig} */
const config = {
  poweredByHeader: false,
  images: {
    formats: ['image/avif', 'image/webp'],
    localPatterns: [{ pathname: '/images/**', search: '' }, { pathname: '/brand/**', search: '' }],
  },
  async redirects() {
    return ['people', 'rulers'].map(section => ({ source: `/:locale(ar|en)/${section}`, destination: '/:locale/notable-figures', permanent: true }));
  },
  async headers() {
    return [
      { source: '/:path*', headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
        ...(process.env.NODE_ENV === 'production' ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }] : []),
      ] },
      // Payload's own RSC responses send `Cache-Control: no-cache, must-revalidate`,
      // which still lets browsers restore /admin from the back/forward cache (bfcache)
      // after logout, showing a stale authenticated snapshot with no new server
      // request. `no-store` explicitly disables bfcache eligibility for /admin.
      { source: '/admin', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
      { source: '/admin/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
    ];
  },
};
export default withPayload(config);