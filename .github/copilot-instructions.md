Read AGENTS.md and the relevant installed Next.js guides under node_modules/next/dist/docs before Next.js edits. Use the installed Next/Payload APIs, not remembered conventions.

Respect assigned file scopes and concurrent work. Keep TypeScript strict; use typed mocks and unknown narrowing, never explicit any. Tests use node:test and relative imports, without a real database by default.

Maintain Arabic RTL and English LTR with equivalent content and stable locale routes. Zain is mandatory for both languages and form controls; avoid duplicate font loading and disclose external Google Fonts requests. Keep geographic maps north-up in RTL.

Use Flaticon only after verifying each asset license and attribution. Do not substitute another icon library. Record image/logo sources and modifications in docs/asset-licenses.md and show required public credits.

Never invent facts, citations, authors, review dates, licenses, counts or completion claims. The seed is 30 bilingual editorial previews, not 150 completed topics. Human factual/translation review and content expansion remain launch gates. Current map is an outline plus region links; normalized in-memory search is not pg_trgm.

Keep CMS secrets server-only. Public Payload Local API reads require overrideAccess:false, user:null, draft:false and approved published filtering. Serve only complete matching ar/en pairs. Unconfigured CMS may show labeled demo data; configured failures must not silently fall back. Do not add cross-request caching that hides unpublishing.

Run beforeOperation intent hooks before workflow hooks in tests. Preserve server-side role checks, immutable translation keys, audit integrity, approval reset on edits and immediate draft unpublishing. Seed only drafts through an existing administrator, never create accounts, overwrite records or bypass article access checks.

Keep uploads private by default, validate original raster bytes and enforce image limits. Production CMS requires private S3 and access-controlled delivery without protected-media caching. Keep SITE_INDEXABLE=false until editorial and launch approval; noindex is not authentication.

Check package.json before running commands. Intended checks: npm run lint, npm run typecheck, npm run test, npm run build, npm run test:e2e. Unit runner: node --import tsx --test tests/unit/*.test.ts. Development: npm run dev; production smoke test: npm run start after build. CMS commands: npm run cms:seed, npm run cms:generate-types, npm run cms:migrate:create, npm run cms:migrate. Do not run seed, migrations or production writes without an explicit task and a verified target. Report checks actually run and their limits; never claim deployment or DB/S3 verification from unit tests.