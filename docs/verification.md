# Verification and remaining release gates

Local verification on 2026-09-09, Windows, Node 24.19.0, Next 16.3.4, Payload 3.88.0.

- ESLint and TypeScript checks passed.
- 34 database-free node:test checks passed, covering bilingual previews, normalized search, workflow intent, role boundaries, approved translation pairing, image validation and CMS environment guards.
- Production build passed with public home/section/article/search, admin, REST, robots and sitemap routes.
- Five Playwright Chromium journeys passed against `next start`: Arabic/English article switching; search and section filters; all 13 region links and pagination; mobile layout/font/menu/404; unconfigured admin and public API guards/noindex.
- Public development server started at http://localhost:3000/ar. Desktop UI visually inspected; Zain font loaded and no horizontal overflow at the inspected viewport. These checks do not establish a Lighthouse/Core Web Vitals score or full accessibility conformance.

## Dependency audit

`npm audit --omit=dev` reported **14 affected dependency entries: 13 moderate, 1 low** (including transitive chains, not fourteen distinct root vulnerabilities). `npm audit fix` made no change. No forced downgrade was used.

- Payload account-unlock advisory GHSA-jg8r-5jh2-v2xj: this application sets explicit `Users.access.unlock = isAdmin` rather than relying on the permissive upstream default. Role tests cover this rule; live REST verification is still required.
- DOMPurify advisories via Monaco in the CMS and old esbuild via Drizzle's migration tooling remain dependency release gates. Do not claim a clean security audit or deploy the CMS publicly without resolving/assessing these against maintained upstream versions.
- No real database, object-storage credentials or published deployment was available. Database migrations, first-user concurrency, real REST workflow, private S3 delivery, backups and restore remain unverified.

## Scope

30 bilingual editorial introductions are implemented, not 150 completed articles. Human factual/translation review, sources for 25 introductory topics and broader original content remain required. The region explorer is a north-up outline plus 13 region links, not a region-boundary interactive map. Search is normalized in memory, not PostgreSQL pg_trgm. Flaticon integration awaits verified asset licensing; no other icon provider was substituted. Keep SITE_INDEXABLE=false until editorial and launch approval.