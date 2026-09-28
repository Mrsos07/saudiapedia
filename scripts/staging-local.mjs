// Disposable local staging database (Docker PostgreSQL 17) mirroring production roles and grants.
// Never connects to Supabase. Credentials live outside the workspace and are never printed.
//   node scripts/staging-local.mjs up        start + provision (idempotent)
//   node scripts/staging-local.mjs migrate   payload migrate as kingdom_migrator
//   node scripts/staging-local.mjs status    list applied migrations
//   node scripts/staging-local.mjs run -- <command...>   run a command with the runtime environment
//   node scripts/staging-local.mjs dev       next dev on http://localhost:3300 against staging
//   node scripts/staging-local.mjs down      stop and remove the container and its volume
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { Client } = require(require.resolve('pg', { paths: [require.resolve('@payloadcms/db-postgres')] }));
const root = path.resolve(import.meta.dirname, '..');
const container = 'kingdomsaudi-staging-pg';
const volume = 'kingdomsaudi-staging-pgdata';
const port = 55432;
const vault = path.join(process.env.LOCALAPPDATA ?? path.join(root, '..'), 'KingdomSaudi', 'staging-local');
const credentialsFile = path.join(vault, 'credentials.json');
const uploadsDir = path.join(vault, 'uploads');
const [command, ...rest] = process.argv.slice(2);

const hex = () => randomBytes(32).toString('hex');
function credentials() {
  mkdirSync(vault, { recursive: true });
  if (!existsSync(credentialsFile)) {
    writeFileSync(credentialsFile, JSON.stringify({ postgres: hex(), migrator: hex(), runtime: hex(), payloadSecret: hex(), admin: `${hex().slice(0, 24)}-Staging` }, null, 2), { mode: 0o600 });
  }
  return JSON.parse(readFileSync(credentialsFile, 'utf8'));
}
const docker = (args, options = {}) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim();
const url = (role, password) => `postgresql://${role}:${password}@127.0.0.1:${port}/postgres`;
function environment(creds, role = 'runtime') {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^(S3_|CMS_DATABASE_|CMS_MIGRATOR|CMS_RUNTIME|DATABASE_URL|PAYLOAD_SECRET)/.test(key)) delete env[key];
  return {
    // Bootstrap is opened only for an explicit local loader run; never for dev or production.
    ...env, NODE_ENV: 'development', CMS_DB_PUSH: 'false', SITE_INDEXABLE: 'false', CMS_ALLOW_BOOTSTRAP: process.env.STAGING_BOOTSTRAP === '1' && command === 'run' ? 'true' : 'false',
    STAGING_ADMIN_PASSWORD: creds.admin,
    DATABASE_URL: role === 'migrator' ? url('kingdom_migrator', creds.migrator) : url('kingdom_runtime', creds.runtime),
    PAYLOAD_SECRET: creds.payloadSecret, CMS_SERVER_URL: 'http://localhost:3300', NEXT_PUBLIC_SITE_URL: 'http://localhost:3300',
    PAYLOAD_CONFIG_PATH: 'src/payload.config.ts', CMS_LOCAL_UPLOAD_DIR: uploadsDir,
  };
}
async function waitForDatabase(creds) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const client = new Client({ connectionString: url('postgres', creds.postgres), connectionTimeoutMillis: 2000 });
    try { await client.connect(); await client.query('SELECT 1'); return client; } catch { await client.end().catch(() => {}); await new Promise(r => setTimeout(r, 1000)); }
  }
  throw new Error('Local staging database did not become ready.');
}
function run(cmd, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' });
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
}

try {
  const creds = credentials();
  if (command === 'up') {
    const existing = docker(['ps', '-a', '--filter', `name=^${container}$`, '--format', '{{.State}}']);
    if (!existing) {
      docker(['run', '-d', '--name', container, '-p', `127.0.0.1:${port}:5432`, '-v', `${volume}:/var/lib/postgresql/data`,
        '-e', `POSTGRES_PASSWORD=${creds.postgres}`, 'postgres:17']);
    } else if (existing !== 'running') docker(['start', container]);
    const admin = await waitForDatabase(creds);
    const roles = await admin.query("SELECT rolname FROM pg_roles WHERE rolname IN ('kingdom_migrator','kingdom_runtime')");
    if (!roles.rowCount) {
      const literal = value => "'" + value.replaceAll("'", "''") + "'";
      await admin.query('BEGIN');
      await admin.query(`CREATE ROLE kingdom_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${literal(creds.migrator)}`);
      await admin.query(`CREATE ROLE kingdom_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${literal(creds.runtime)}`);
      await admin.query('CREATE SCHEMA kingdom_cms AUTHORIZATION kingdom_migrator');
      await admin.query('REVOKE ALL ON SCHEMA kingdom_cms FROM PUBLIC');
      await admin.query('GRANT CONNECT ON DATABASE postgres TO kingdom_migrator, kingdom_runtime');
      await admin.query('GRANT USAGE ON SCHEMA kingdom_cms TO kingdom_runtime');
      await admin.query('SET LOCAL ROLE kingdom_migrator');
      await admin.query('ALTER DEFAULT PRIVILEGES IN SCHEMA kingdom_cms REVOKE ALL ON TABLES FROM PUBLIC');
      await admin.query('ALTER DEFAULT PRIVILEGES IN SCHEMA kingdom_cms GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kingdom_runtime');
      await admin.query('ALTER DEFAULT PRIVILEGES IN SCHEMA kingdom_cms GRANT USAGE, SELECT ON SEQUENCES TO kingdom_runtime');
      await admin.query('RESET ROLE');
      await admin.query('COMMIT');
      console.log('Provisioned kingdom_migrator/kingdom_runtime and schema kingdom_cms (production-equivalent grants).');
    }
    const version = await admin.query('SHOW server_version');
    await admin.end();
    mkdirSync(uploadsDir, { recursive: true });
    console.log(`Local staging PostgreSQL ${version.rows[0].server_version} ready on 127.0.0.1:${port}. Credentials: ${credentialsFile}`);
  } else if (command === 'migrate') {
    process.exitCode = await run('npx', ['payload', 'migrate'], environment(creds, 'migrator'));
  } else if (command === 'status') {
    process.exitCode = await run('npx', ['payload', 'migrate:status'], environment(creds, 'migrator'));
  } else if (command === 'run') {
    const args = rest[0] === '--' ? rest.slice(1) : rest;
    process.exitCode = await run(args[0], args.slice(1), environment(creds, process.env.STAGING_ROLE === 'migrator' ? 'migrator' : 'runtime'));
  } else if (command === 'dev') {
    process.exitCode = await run('npx', ['next', 'dev', '--port', '3300'], environment(creds));
  } else if (command === 'down') {
    docker(['rm', '-f', container]);
    docker(['volume', 'rm', volume]);
    console.log('Removed local staging container and volume. Credentials file kept for reference.');
  } else {
    throw new Error('Use up, migrate, status, run, dev or down.');
  }
} catch (error) {
  console.error(`Local staging failed: ${error instanceof Error ? error.message.replace(/postgresql:\/\/[^@\s]+@/g, 'postgresql://***@') : 'unexpected error'}`);
  process.exitCode = 1;
}
