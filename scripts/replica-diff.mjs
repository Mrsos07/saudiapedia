// Compares prod_original (untouched restore of the production backup) with prod_replica (same restore
// after Payload applied the batches) and writes the difference as guarded SQL chunks for production.
//   node scripts/replica-diff.mjs <outDir>
// Rows are written with jsonb_populate_record so every value keeps its exact column type.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { Client } = require(require.resolve('pg', { paths: [require.resolve('@payloadcms/db-postgres')] }));
const outDir = process.argv[2];
if (!outDir) throw new Error('Usage: replica-diff.mjs <outDir>');
const creds = JSON.parse(readFileSync(`${process.env.LOCALAPPDATA}/KingdomSaudi/staging-local/credentials.json`, 'utf8'));
const connect = async database => { const client = new Client({ host: '127.0.0.1', port: 55432, user: 'postgres', password: creds.postgres, database }); await client.connect(); return client; };
const original = await connect(process.argv[3] ?? 'prod_original');
const replica = await connect(process.argv[4] ?? 'prod_replica');
// Editing locks are transient admin-session state, never content to transfer.
const IGNORED = new Set(['payload_locked_documents', 'payload_locked_documents_rels', 'payload_preferences', 'payload_preferences_rels']);
const S = 'kingdom_cms';
const quote = value => {
  if (value.includes('$json$')) throw new Error('Unexpected dollar-quote delimiter inside data.');
  return `$json$${value}$json$`;
};

try {
  const tables = (await replica.query(`select c.relname as table, array_agg(a.attname::text order by array_position(i.indkey, a.attnum)) as pk
    from pg_index i join pg_class c on c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum = any(i.indkey)
    where i.indisprimary and n.nspname = $1 group by c.relname order by c.relname`, [S])).rows;
  const fks = (await replica.query(`select cl.relname as child, pc.relname as parent from pg_constraint c join pg_class cl on cl.oid = c.conrelid join pg_class pc on pc.oid = c.confrelid join pg_namespace n on n.oid = cl.relnamespace where c.contype = 'f' and n.nspname = $1`, [S])).rows;
  const changes = {};
  for (const { table, pk } of tables) {
    if (IGNORED.has(table)) continue;
    const key = row => pk.map(column => String(row[column])).join('\u0001');
    const read = async client => new Map((await client.query(`select to_jsonb(t) as row from ${S}."${table}" t`)).rows.map(({ row }) => [key(row), row]));
    const [before, after] = await Promise.all([read(original), read(replica)]);
    const inserted = [...after].filter(([k]) => !before.has(k)).map(([, row]) => row);
    const deleted = [...before].filter(([k]) => !after.has(k)).map(([, row]) => row);
    const updated = [...after].filter(([k, row]) => before.has(k) && JSON.stringify(before.get(k)) !== JSON.stringify(row)).map(([, row]) => row);
    if (inserted.length || deleted.length || updated.length) changes[table] = { pk, inserted, deleted, updated };
  }
  // Parents before children for inserts/updates, children before parents for deletes.
  const order = [];
  const pending = new Set(Object.keys(changes));
  while (pending.size) {
    const ready = [...pending].filter(table => !fks.some(fk => fk.child === table && fk.parent !== table && pending.has(fk.parent)));
    if (!ready.length) throw new Error(`Foreign-key cycle among ${[...pending].join(', ')}`);
    for (const table of ready.sort()) { order.push(table); pending.delete(table); }
  }
  const where = (pk, row) => pk.map(column => `t."${column}" = r."${column}"`).join(' and ');
  const record = (table, row) => `jsonb_populate_record(null::${S}."${table}", ${quote(JSON.stringify(row))}::jsonb)`;
  const statements = [];
  for (const table of [...order].reverse()) for (const row of changes[table].deleted) statements.push(`delete from ${S}."${table}" t using ${record(table, row)} r where ${where(changes[table].pk, row)};`);
  for (const table of order) {
    const { pk, inserted, updated } = changes[table];
    // Self-referencing rows (article parent) are inserted in id order so parents come first.
    for (const row of [...inserted].sort((a, b) => (a.id > b.id ? 1 : -1))) statements.push(`insert into ${S}."${table}" select * from ${record(table, row)};`);
    for (const row of updated) {
      const columns = Object.keys(row).filter(column => !pk.includes(column));
      statements.push(`update ${S}."${table}" t set ${columns.map(column => `"${column}" = r."${column}"`).join(', ')} from ${record(table, row)} r where ${where(pk, row)};`);
    }
  }
  const sequences = (await replica.query(`select sequencename, last_value from pg_sequences where schemaname = $1 and last_value is not null`, [S])).rows;
  const originalSeq = new Map((await original.query(`select sequencename, last_value from pg_sequences where schemaname = $1`, [S])).rows.map(row => [row.sequencename, row.last_value]));
  for (const { sequencename, last_value } of sequences) if (String(originalSeq.get(sequencename)) !== String(last_value)) statements.push(`select setval('${S}."${sequencename}"', ${last_value});`);

  // Guard: abort unless production still matches the backup the replica was built from.
  const fingerprint = async client => (await client.query(`select (select count(*) from ${S}.articles)::int as articles, (select coalesce(max(updated_at)::text, '') from ${S}.articles) as updated, (select coalesce(max(id), 0) from ${S}._articles_v)::int as versions, (select count(*) from ${S}.payload_migrations)::int as migrations`)).rows[0];
  const expected = await fingerprint(original);
  const guard = `do $guard$ begin
  if (select count(*) from ${S}.articles) <> ${expected.articles}
    or (select coalesce(max(updated_at)::text, '') from ${S}.articles) <> '${expected.updated}'
    or (select coalesce(max(id), 0) from ${S}._articles_v) <> ${expected.versions}
    or (select count(*) from ${S}.payload_migrations) <> ${expected.migrations}
  then raise exception 'Production changed since the backup; regenerate the transfer.'; end if; end $guard$;`;
  mkdirSync(outDir, { recursive: true });
  const sql = ['begin;', guard, ...statements, 'commit;'].join('\n');
  writeFileSync(path.join(outDir, 'transfer.sql'), sql);
  const summary = Object.fromEntries(Object.entries(changes).map(([table, c]) => [table, { inserted: c.inserted.length, updated: c.updated.length, deleted: c.deleted.length }]));
  console.log(JSON.stringify({ tables: summary, statements: statements.length, bytes: Buffer.byteLength(sql), guard: expected }, null, 1));
} finally {
  await Promise.all([original.end(), replica.end()]);
}
