// Local operator utility. No credentials, query values, or row contents are logged.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Client } = require(require.resolve('pg', { paths: [require.resolve('@payloadcms/db-postgres')] }));
const project = 'vexushpbyvaoangxyqcm';
const host = 'aws-0-ap-northeast-1.pooler.supabase.com';
const schema = 'kingdom_cms';
const mode = process.argv[2];
if (!['inspect', 'provision', 'verify'].includes(mode)) throw new Error('Unsupported operation');
const clients = [];
function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
function literal(value) { return "'" + value.replaceAll("'", "''") + "'"; }
async function connect(role, password, ca) {
  const client = new Client({ host, port: 5432, user: `${role}.${project}`, database: 'postgres', password,
    ssl: { ca, rejectUnauthorized: true }, connectionTimeoutMillis: 15000, statement_timeout: 20000 });
  clients.push(client);
  await client.connect();
  const stream = client.connection.stream;
  if (stream.encrypted !== true || stream.authorized !== true) throw new Error('Verified client TLS required');
  return client;
}
try {
  const caPath = required('CMS_DATABASE_CA_FILE');
  if (mode === 'inspect') {
    const response = await fetch('https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt', { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('CA download failed');
    const certificate = await response.text();
    if (!certificate.includes('-----BEGIN CERTIFICATE-----')) throw new Error('Invalid CA');
    writeFileSync(caPath, certificate, { mode: 0o600 });
  }
  const ca = readFileSync(caPath, 'utf8');
  if (mode === 'verify') {
    const runtime = await connect('kingdom_runtime', required('CMS_RUNTIME_PASSWORD'), ca);
    const counts = await runtime.query('SELECT (SELECT count(*)::int FROM kingdom_cms.users) AS users, (SELECT count(*)::int FROM kingdom_cms.articles) AS articles, (SELECT count(*)::int FROM kingdom_cms.sections) AS sections');
    const privileges = await runtime.query("SELECT current_user AS role, has_schema_privilege(current_user, 'kingdom_cms', 'CREATE') AS can_create_schema_objects, has_schema_privilege(current_user, 'kingdom_cms', 'USAGE') AS can_use_schema");
    if (privileges.rows[0].can_create_schema_objects || !privileges.rows[0].can_use_schema) throw new Error('Runtime schema privileges are incorrect');
    const migrations = await runtime.query('SELECT name, batch FROM kingdom_cms.payload_migrations ORDER BY id');
    const latestSnapshot = readdirSync('src/collections/migrations').filter(name => name.endsWith('.json')).sort().at(-1);
    if (!latestSnapshot) throw new Error('Migration snapshot missing');
    const snapshot = JSON.parse(readFileSync(`src/collections/migrations/${latestSnapshot}`, 'utf8'));
    const expectedTables = Object.values(snapshot.tables).map(table => table.name).sort();
    const tables = await runtime.query("SELECT tablename FROM pg_tables WHERE schemaname='kingdom_cms' ORDER BY tablename");
    if (JSON.stringify(tables.rows.map(row => row.tablename)) !== JSON.stringify(expectedTables)) throw new Error('Migration table inventory mismatch');
    const indexes = await runtime.query("SELECT indexname FROM pg_indexes WHERE schemaname='kingdom_cms' AND indexname IN ('users_bootstrap_key_idx','users_email_idx','slug_locale_section_idx','translationKey_locale_idx') ORDER BY indexname");
    if (indexes.rowCount !== 4) throw new Error('Required unique indexes missing');
    const foreignKeys = await runtime.query("SELECT count(*)::int AS count FROM pg_constraint WHERE connamespace='kingdom_cms'::regnamespace AND contype='f'");
    const access = await runtime.query("SELECT r.rolname, has_schema_privilege(r.rolname, 'kingdom_cms', 'USAGE') AS schema_access FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role') ORDER BY r.rolname");
    if (access.rows.some(row => row.schema_access)) throw new Error('Unexpected API role access');
    const role = await runtime.query('SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname=current_user');
    if (Object.values(role.rows[0]).some(Boolean)) throw new Error('Excessive runtime privileges');
    // Test only internal KV storage. No user/article hooks are bypassed and no sequence is advanced.
    const marker = `cms-verification-${randomUUID()}`;
    await runtime.query('BEGIN');
    try {
      await runtime.query('INSERT INTO kingdom_cms.payload_kv (id, key, data) VALUES ($1, $2, $3)', [-2147483647, marker, JSON.stringify({ check: 'insert' })]);
      await runtime.query('UPDATE kingdom_cms.payload_kv SET data=$1 WHERE key=$2', [JSON.stringify({ check: 'update' }), marker]);
      const read = await runtime.query('SELECT data FROM kingdom_cms.payload_kv WHERE key=$1', [marker]);
      if (read.rows[0]?.data?.check !== 'update') throw new Error('Read/write check failed');
      const removed = await runtime.query('DELETE FROM kingdom_cms.payload_kv WHERE key=$1', [marker]);
      if (removed.rowCount !== 1) throw new Error('Delete check failed');
    } finally { await runtime.query('ROLLBACK'); }
    console.log(JSON.stringify({ project, clientTLSVerified: true, ...privileges.rows[0], counts: counts.rows[0], migrations: migrations.rows,
      tableCount: tables.rowCount, tables: tables.rows.map(row => row.tablename), criticalIndexes: indexes.rows,
      foreignKeyCount: foreignKeys.rows[0].count, apiRoleAccess: access.rows, runtimeCrudRollback: true }));
  } else {
    // One-time administrator input explicitly supplied by the operator. Never used by Next.js.
    const values = parseEnv(readFileSync('.env.example', 'utf8'));
    const key = Object.keys(values).find(k => k.toLowerCase() === 'databasepassword');
    if (!key || !values[key]?.trim()) throw new Error('Missing operator databasepassword');
    const admin = await connect('postgres', values[key], ca);
    const tables = await admin.query("SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN ('public', 'kingdom_cms') ORDER BY schemaname, tablename");
    const roles = await admin.query("SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname IN ('kingdom_migrator','kingdom_runtime')");
    if (mode === 'inspect') {
      const transport = await admin.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()');
      console.log(JSON.stringify({ project, clientTLSVerified: true, poolerToDatabaseTLS: transport.rows[0]?.ssl, tables: tables.rows, roles: roles.rows }));
    } else {
      if (tables.rows.length || roles.rows.length) throw new Error('Provisioning requires an empty target and unused role names; refusing to overwrite');
      const migrator = required('CMS_MIGRATOR_PASSWORD');
      const runtime = required('CMS_RUNTIME_PASSWORD');
      if (!/^[a-f0-9]{64}$/.test(migrator) || !/^[a-f0-9]{64}$/.test(runtime)) throw new Error('Invalid generated credentials');
      await admin.query('BEGIN');
      try {
        await admin.query(`CREATE ROLE kingdom_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${literal(migrator)}`);
        await admin.query(`CREATE ROLE kingdom_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${literal(runtime)}`);
        // Temporary membership permits SET ROLE/ownership assignment; removed before commit.
        await admin.query('GRANT kingdom_migrator TO postgres');
        await admin.query('CREATE SCHEMA kingdom_cms AUTHORIZATION kingdom_migrator');
        await admin.query('REVOKE ALL ON SCHEMA kingdom_cms FROM PUBLIC, anon, authenticated, service_role');
        await admin.query('GRANT CONNECT ON DATABASE postgres TO kingdom_migrator, kingdom_runtime');
        await admin.query('GRANT USAGE ON SCHEMA kingdom_cms TO kingdom_runtime');
        await admin.query('SET LOCAL ROLE kingdom_migrator');
        await admin.query('ALTER DEFAULT PRIVILEGES IN SCHEMA kingdom_cms REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role');
        await admin.query('ALTER DEFAULT PRIVILEGES IN SCHEMA kingdom_cms GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kingdom_runtime');
        await admin.query('ALTER DEFAULT PRIVILEGES IN SCHEMA kingdom_cms GRANT USAGE, SELECT ON SEQUENCES TO kingdom_runtime');
        await admin.query('RESET ROLE');
        await admin.query('REVOKE kingdom_migrator FROM postgres');
        await admin.query('COMMIT');
        console.log(JSON.stringify({ project, provisioned: true, schema, roles: ['kingdom_migrator', 'kingdom_runtime'], clientTLSVerified: true }));
      } catch (error) { await admin.query('ROLLBACK'); throw error; }
    }
  }
} catch (error) {
  // Avoid logging SQL/driver errors: statements can contain generated passwords.
  console.error(JSON.stringify({ operation: mode, failed: true, code: typeof error?.code === 'string' ? error.code : 'OPERATION_FAILED' }));
  process.exitCode = 1;
} finally {
  await Promise.all(clients.map(client => client.end().catch(() => {})));
}