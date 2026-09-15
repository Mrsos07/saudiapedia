import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { postgresAdapter } from '@payloadcms/db-postgres';
import { s3Storage } from '@payloadcms/storage-s3';
import { ar } from '@payloadcms/translations/languages/ar';
import { en } from '@payloadcms/translations/languages/en';
import { buildConfig } from 'payload';
import sharp from 'sharp';
import { Articles } from './collections/Articles';
import { Media } from './collections/Media';
import { Sources } from './collections/Sources';
import { Users } from './collections/Users';
import { Categories } from './collections/Categories';
import { Authors } from './collections/Authors';
import { PageViews } from './collections/PageViews';
import { Sections } from './collections/Sections';

const baseDir = path.dirname(fileURLToPath(import.meta.url));
const databaseURL = process.env.DATABASE_URL?.trim();
const secret = process.env.PAYLOAD_SECRET?.trim();

// Web entry points guard BEFORE importing this module. CLI use must fail clearly,
// without a made-up secret, dummy database, or partially initialized adapter.
if (!databaseURL || !secret) {
  throw new Error('CMS is not configured. Set DATABASE_URL and PAYLOAD_SECRET in the server environment; see docs/cms.md.');
}
if (secret.length < 32) throw new Error('PAYLOAD_SECRET must contain at least 32 random characters.');

const s3Keys = ['S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const;
const hasS3 = s3Keys.every((key) => Boolean(process.env[key]?.trim()));
if (!hasS3 && [...s3Keys, 'S3_ENDPOINT'].some((key) => Boolean(process.env[key]?.trim()))) {
  throw new Error('Incomplete S3 configuration. Set all four required S3 values, or remove all S3 values for local development.');
}
if (!hasS3 && process.env.NODE_ENV === 'production') {
  throw new Error('Production CMS requires private S3-compatible storage. Local uploads are development-only.');
}
const serverURL = process.env.CMS_SERVER_URL?.trim() || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000');
if (!serverURL) throw new Error('CMS_SERVER_URL is required in production.');
const origin = new URL(serverURL);
if (!['https:', 'http:'].includes(origin.protocol) || origin.origin !== serverURL || (process.env.NODE_ENV === 'production' && origin.protocol !== 'https:')) {
  throw new Error('CMS_SERVER_URL must be an origin without a path or trailing slash, using HTTPS in production.');
}

export default buildConfig({
  secret,
  serverURL,
  admin: {
    user: Users.slug,
    theme: 'light',
    components: {
      beforeDashboard: ['/components/admin/editorial-dashboard#EditorialDashboard'],
      beforeLogin: ['/components/admin/login-intro#LoginIntro'],
      afterLogin: ['/components/admin/login-intro#LoginFooter'],
      graphics: { Logo: '/components/admin/login-intro#LoginLogo' },
      afterNavLinks: ['/components/admin/analytics-nav-link#AnalyticsNavLink'],
      views: {
        analytics: {
          Component: '/components/admin/analytics-view#AnalyticsView',
          path: '/analytics',
          exact: true,
          meta: { title: 'Analytics', description: 'Editorial analytics' },
        },
      },
    },
    importMap: { baseDir, importMapFile: path.resolve(baseDir, 'app/(payload)/admin/importMap.ts'), autoGenerate: false },
    meta: { titleSuffix: ' | Kingdom Encyclopedia CMS' },
  },
  routes: { admin: '/admin', api: '/api' },
  i18n: { supportedLanguages: { ar, en }, fallbackLanguage: 'ar' },
  collections: [Users, Articles, Categories, Authors, Sections, Sources, Media, PageViews],
  db: postgresAdapter({
    pool: {
      connectionString: databaseURL,
      max: 3,
      connectionTimeoutMillis: 15000,
      ...(process.env.CMS_DATABASE_CA_FILE ? {
        ssl: { ca: readFileSync(process.env.CMS_DATABASE_CA_FILE, 'utf8'), rejectUnauthorized: true },
      } : {}),
    },
    schemaName: 'kingdom_cms',
    push: process.env.NODE_ENV !== 'production' && process.env.CMS_DB_PUSH === 'true',
    disableCreateDatabase: true,
    migrationDir: path.resolve(baseDir, 'collections/migrations'),
  }),
  sharp,
  upload: { limits: { fileSize: 10 * 1024 * 1024 }, abortOnLimit: true },
  cors: [serverURL],
  csrf: [serverURL],
  // REST is the public API; do not expose a second GraphQL surface accidentally.
  graphQL: { disable: true },
  typescript: { autoGenerate: false, outputFile: path.resolve(baseDir, 'collections/payload-types.ts') },
  plugins: hasS3 ? [s3Storage({
    bucket: process.env.S3_BUCKET!,
    collections: { media: true },
    // Leave Payload access control enabled and use its /api/media/file/... URLs.
    // Never use public-read ACLs, direct public bucket URLs or signed redirects.
    clientUploads: false,
    signedDownloads: false,
    config: {
      region: process.env.S3_REGION!,
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
    },
  })] : [],
});