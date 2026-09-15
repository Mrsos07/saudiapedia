<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Public navigation and verification

- `/ar/notable-figures` and `/en/notable-figures` are the unified «شخصيات بارزة» / “Notable figures” listings, including all rulers and biographies. Keep article URLs and stored section slugs unchanged; the `/people` and `/rulers` listings in both languages permanently redirect to the unified listings with query parameters preserved.
- `src/lib/site.ts` is imported by the client-side header. Keep its encyclopedia import type-only: a runtime import pulls the introductory article dataset into browser JavaScript. Unit tests check that the navigation and seed section labels stay aligned.
- The homepage history overview selects `history/first-saudi-state`, `history/second-saudi-state`, and `history/third-saudi-state` in that order via `saudiStateHistory()`. It uses only available public content; do not fill missing CMS articles with seed data or unrelated history topics.
- Browser tests require `npm run build` first. `npm run test:e2e` starts the production app on port 3100 with CMS and indexing disabled, and checks both languages without accessing a live database.
- `npm run cms:dev` starts the configured local CMS using the existing Windows-protected configuration. `node scripts/publish-saudi-kings.mjs --validate` checks the bilingual king batch and portraits offline. `--publish` requires explicit editorial authorization and manual administrator sign-in in a fresh Microsoft Edge browser; it uses ordinary REST permissions, preserves existing content, and checks anonymous article/image delivery. Cookie-authenticated automation requests, including `/api/users/me`, must send the configured `Origin`; do not weaken CSRF settings. Never run two publishers concurrently.
- The user-approved seven-king batch was published to the existing local CMS connection on 2026-09-15: article IDs 31–44 and media IDs 15–21. All fourteen public article pages and seven portraits were verified anonymously in both languages. Read current records before any rerun; do not blindly recreate them. The stored `people` section keeps its slug and is labeled «شخصيات بارزة» / “Notable figures” in the CMS.

