# Supabase CMS migration verification

## Storage verification on 2026-09-23

The operator authorized the private bucket `saudiapedia-media` in this same Supabase project. It has a 10 MiB file-size limit and JPEG/PNG/WebP/AVIF restrictions, with no public client Storage policies added. S3 is configured for `ap-northeast-1` using the project's direct storage endpoint.

All 38 CMS media files were copied without changing CMS rows, IDs, publication states or URLs. Authenticated S3 reads matched their local size and SHA-256. All 38 also matched when read through the S3-enabled Payload server on a temporary loopback port, with no-store/nosniff headers. Direct anonymous S3 and public-storage URL reads were denied. Storage metadata showed 38 objects matching all 38 CMS filenames and sizes; the current CMS contains 78 approved published article documents.

Credentials were supplied in a separate local window and saved using Windows DPAPI in `s3-credentials.xml` beside the existing vault. They were not printed or committed. The existing CMS launcher now loads this storage profile for dev/smoke. Render still requires its own secret environment settings and CA secret file; local verification is not proof of a successful Render deployment, authenticated production editing, backup restoration or updated provider-internal TLS.

The sections below preserve the earlier initial-database verification and its limitations.

## Applied target

- Project: `kingdomsaudi-cms`, reference `vexushpbyvaoangxyqcm`, organization `saudi`.
- Database: `postgres`; isolated application schema: `kingdom_cms`.
- Applied migration: `20260910_160547_initial`, batch 1.
- Re-running the migration command completed without applying further migrations.
- In Supabase Table Editor, select **kingdom_cms** rather than **public** to see the CMS tables.

## Verified against the actual database

18 tables matched the generated migration snapshot: users and sessions, articles
and their body/facts/sources, article versions and version arrays, media, sources,
and Payload KV/locks/preferences/migration history. 19 foreign keys were present.
The four critical unique indexes for email, first-user bootstrap, article route,
and translation identity were present.

`kingdom_runtime` can use the schema but cannot create objects in it. Neither
runtime nor migration roles are superusers or have CREATEDB/CREATEROLE/BYPASSRLS.
`anon`, `authenticated`, and `service_role` have no USAGE on the CMS schema.
Runtime INSERT/SELECT/UPDATE/DELETE was exercised on Payload KV in a transaction
that was rolled back, using an explicit ID without advancing a sequence.

Payload initialized with the runtime connection. Anonymous published-article and
released-media queries completed; anonymous users and private-source queries
were denied with 403. No accounts or editorial content were created. At verification,
the users and articles tables were empty. Authentication and publication workflows
with real editorial accounts have not been integration-tested.

## Local operation

`scripts/cms-local.ps1` accepts `migrate`, `verify`, `smoke`, and `dev` actions.
Run it from PowerShell under the same Windows user that provisioned the vault.
Credentials are DPAPI-encrypted in `%LOCALAPPDATA%/KingdomSaudi/vexushpbyvaoangxyqcm/`,
outside the OneDrive workspace. Do not delete/regenerate the vault: it contains
the existing role passwords and stable Payload secret. The `dev` action binds
only to `127.0.0.1:3000`; stop the existing unconfigured development server before
starting it. Ordinary `npm run dev` does not automatically load this vault.

The migration and runtime roles are separate. Never run the web server using the
administrator or migration connection. Schema push and indexing are disabled by
the launcher. Complete the first-administrator flow privately after starting the
configured server; no administrator was provisioned by these checks.

## Security and production limits

- Client-to-pooler TLS and hostname/certificate verification succeeded using the
  official Supabase CA. `pg_stat_ssl` reported **false** for the pooler-to-database
  connection; end-to-end TLS is not claimed. Review provider transport/enforcement
  before production and do not disable client certificate verification.
- Provisioning and inspection now require `CMS_DATABASE_ADMIN_PASSWORD` in the operator's process environment, not a repository file. The launcher removes this variable from web, smoke-test and migration child processes. Historical provisioning used `.env.example`; the security review did not read or modify that secret. The operator must remove any old plaintext copy after securely retaining it and rotate it if it was shared, committed or synchronized to an unintended destination.
- Private S3, mail delivery, backups/restore, network restrictions, and a production
  deployment were not configured or verified here. The production S3 guard remains.
- The baseline was generated with local-development storage. Review/generate any
  schema difference against the actual S3-enabled production configuration before
  production rollout; do not assume storage configuration is equivalent.

## Code checks

The integration smoke script completed with exit success after explicit cleanup
and CLI exit. `npm run typecheck` passed; `npm run test` passed all 36 tests;
`npm run lint` reported zero errors and four unused-argument warnings in the
generated initial migration. No build, e2e login, deployment, or S3 verification
is claimed.