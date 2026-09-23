import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { deploymentOrigins, productionEnvironment, productionBuildEnvironment, databaseConnectionOptions, verifyDeploymentOrigin } from '../../src/lib/production';
import { cmsConfigured } from '../../src/lib/cms';
import { GET as health } from '../../src/app/(payload)/api/health/route';
import { safeMediaRecord } from '../../scripts/storage-transfer.mjs';

const fixture = () => ({
  RENDER_EXTERNAL_URL: 'https://example.org', DATABASE_URL: 'postgresql://kingdom_runtime.project:test-only@unused.invalid/postgres',
  PAYLOAD_SECRET: 'test-only-not-a-real-secret-32-characters', CMS_DATABASE_CA_FILE: '/etc/secrets/fixture.crt',
  S3_BUCKET: 'fixture-bucket', S3_REGION: 'ap-northeast-1', S3_ENDPOINT: 'https://storage.example.org/storage/v1/s3',
  S3_ACCESS_KEY_ID: 'test-only', S3_SECRET_ACCESS_KEY: 'test-only', S3_FORCE_PATH_STYLE: 'true',
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
});

test('Render origins are explicit HTTPS origins shared by metadata and CMS', () => {
  const env = deploymentOrigins(fixture());
  assert.equal(env.CMS_SERVER_URL, 'https://example.org');
  assert.equal(env.NEXT_PUBLIC_SITE_URL, 'https://example.org');
  for (const url of ['http://example.org', 'https://user:password@example.org', 'https://example.org/path', 'https://example.org?q=1', 'https://localhost']) {
    assert.throws(() => deploymentOrigins({ NEXT_PUBLIC_SITE_URL: url }), /production setting/);
  }
  assert.throws(() => deploymentOrigins({ ...fixture(), CMS_SERVER_URL: 'https://other.example', NEXT_PUBLIC_SITE_URL: 'https://example.org' }));
});

test('production requires storage, protected runtime role and stable security settings', () => {
  const env = productionEnvironment(fixture());
  assert.equal(env.CMS_REQUIRED, 'true');
  assert.equal(env.SITE_INDEXABLE, 'false');
  assert.equal(env.PORT, '10000');
  assert.equal(env.CMS_DB_PUSH, 'false');
  for (const change of [{ S3_SECRET_ACCESS_KEY: '' }, { PAYLOAD_SECRET: 'weak' }, { CMS_DATABASE_CA_FILE: '' },
    { CMS_DB_PUSH: 'true' }, { CMS_ALLOW_BOOTSTRAP: 'true' }, { PORT: '0' }, { PORT: '65536' }, { PORT: '10000 --bad' },
    { S3_ENDPOINT: 'http://example.org' }, { DATABASE_URL: 'postgresql://postgres:test-only@unused.invalid/postgres' },
    { CMS_DATABASE_ADMIN_PASSWORD: 'test-only' }, { NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: 'invalid' }, { NODE_TLS_REJECT_UNAUTHORIZED: '0' }]) {
    assert.throws(() => productionEnvironment({ ...fixture(), ...change }), /production setting/);
  }
});

test('production TLS cannot be silently disabled or replace the supplied CA through a URL', () => {
  const env = { ...fixture(), NODE_ENV: 'production' };
  assert.deepEqual(databaseConnectionOptions(env, 'fixture-ca').ssl, { rejectUnauthorized: true, ca: 'fixture-ca' });
  for (const query of ['sslmode=disable', 'sslmode=require', 'sslmode=no-verify', 'sslrootcert=other', 'user=postgres']) {
    assert.throws(() => databaseConnectionOptions({ ...env, DATABASE_URL: `${env.DATABASE_URL}?${query}` }, 'fixture-ca'));
  }
});

test('Render builds have no CMS/storage credentials and retain the public origin', () => {
  const original = fixture();
  const build = productionBuildEnvironment(original);
  for (const key of ['DATABASE_URL', 'PAYLOAD_SECRET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_BUCKET']) assert.equal(build[key], '');
  assert.equal(build.CMS_REQUIRED, 'false');
  assert.equal(build.NEXT_PUBLIC_SITE_URL, 'https://example.org');
  assert.notEqual(original.PAYLOAD_SECRET, '');
  assert.equal(build.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY, original.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY);
  assert.throws(() => productionBuildEnvironment({ ...original, NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: '' }), /NEXT_SERVER_ACTIONS_ENCRYPTION_KEY/);
  assert.doesNotThrow(() => verifyDeploymentOrigin('https://example.org', original));
  assert.throws(() => verifyDeploymentOrigin('https://other.example', original), /rebuild/);
});

test('required CMS never falls back to demo and health is unavailable without configuration', async () => {
  const before = { DATABASE_URL: process.env.DATABASE_URL, PAYLOAD_SECRET: process.env.PAYLOAD_SECRET, CMS_REQUIRED: process.env.CMS_REQUIRED, RENDER_EXTERNAL_URL: process.env.RENDER_EXTERNAL_URL, NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL };
  try {
    process.env.DATABASE_URL = '';
    process.env.PAYLOAD_SECRET = '';
    process.env.CMS_REQUIRED = 'true';
    assert.throws(cmsConfigured, /required/);
    const result = await health();
    assert.equal(result.status, 503);
    assert.deepEqual(await result.json(), { status: 'unavailable' });
    assert.equal(result.headers.get('Cache-Control'), 'private, no-store');
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('media transfer accepts only bounded, plain WebP filenames from the inventory', () => {
  const valid = { filename: 'king-salman.webp', mime_type: 'image/webp', filesize: '104748' };
  assert.equal(safeMediaRecord(valid), true);
  for (const change of [{ filename: '../secret.webp' }, { filename: 'C:\\secret.webp' }, { filename: 'nested/file.webp' }, { filesize: 'NaN' }, { filesize: 10485761 }, { mime_type: 'text/html' }]) {
    assert.equal(safeMediaRecord({ ...valid, ...change }), false);
  }
});

test('Render blueprint and storage tooling do not seed, migrate, publish buckets or log secrets', async () => {
  const blueprint = await readFile(new URL('../../.devin/render.yaml', import.meta.url), 'utf8');
  assert.match(blueprint, /runtime: node/);
  assert.match(blueprint, /healthCheckPath: \/api\/health/);
  assert.match(blueprint, /npm ci --include=dev && npm run render:build/);
  assert.doesNotMatch(blueprint, /preDeployCommand|cms:seed|cms:migrate|generateValue: true[\s\S]*PAYLOAD_SECRET/);
  const transfer = await readFile(new URL('../../scripts/storage-transfer.mjs', import.meta.url), 'utf8');
  assert.match(transfer, /IfNoneMatch: '\*'/);
  assert.doesNotMatch(transfer, /DeleteObjectCommand|DeleteBucketCommand|ACL:|INSERT INTO|UPDATE kingdom_cms/);
});
