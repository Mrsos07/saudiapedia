import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildCacheDirectory, syncBuildCache } from '../../scripts/render';
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

async function cacheFixture(t: TestContext) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'saudiapedia-build-cache-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const project = path.join(directory, 'project');
  await mkdir(project);
  await writeFile(path.join(project, 'package-lock.json'), '{"lockfileVersion":3}');
  await writeFile(path.join(project, 'next.config.mjs'), 'export default {};');
  const env = { ...productionBuildEnvironment(fixture()), RENDER: 'true', XDG_CACHE_HOME: path.join(directory, 'persistent') };
  return { directory, project, env };
}

test('compiler cache is restricted to Render with an absolute persistent cache directory', async t => {
  const { project, env } = await cacheFixture(t);
  for (const change of [{ RENDER: '' }, { RENDER: 'false' }, { XDG_CACHE_HOME: '' }, { XDG_CACHE_HOME: 'relative-cache' }]) {
    assert.equal(await buildCacheDirectory({ ...env, ...change }, project), null);
    assert.equal(await syncBuildCache('save', { ...env, ...change }, project), false);
  }
});

test('compiler cache survives a clean build workspace without persisting images, fetches or deployment metadata', async t => {
  const { project, env } = await cacheFixture(t);
  const local = path.join(project, '.next', 'cache');
  assert.equal(await syncBuildCache('restore', env, project), false);
  for (const name of ['turbopack', 'swc', 'webpack', 'images', 'fetch-cache']) {
    await mkdir(path.join(local, name), { recursive: true });
    await writeFile(path.join(local, name, 'fixture'), name);
  }
  await writeFile(path.join(local, '.tsbuildinfo'), 'typecheck-fixture');
  await writeFile(path.join(project, '.next', 'render-origin.json'), 'deployment-fixture');
  assert.equal(await syncBuildCache('save', env, project), true);
  const persistent = await buildCacheDirectory(env, project);
  assert.ok(persistent);
  for (const excluded of ['images', 'fetch-cache', 'render-origin.json']) {
    await assert.rejects(access(path.join(persistent, excluded)), { code: 'ENOENT' });
  }
  await rm(path.join(project, '.next'), { recursive: true });
  assert.equal(await syncBuildCache('restore', env, project), true);
  for (const name of ['turbopack', 'swc', 'webpack']) {
    assert.equal(await readFile(path.join(local, name, 'fixture'), 'utf8'), name);
  }
  assert.equal(await readFile(path.join(local, '.tsbuildinfo'), 'utf8'), 'typecheck-fixture');
  await assert.rejects(access(path.join(project, '.next', 'render-origin.json')), { code: 'ENOENT' });
  for (const excluded of ['images', 'fetch-cache']) await assert.rejects(access(path.join(local, excluded)), { code: 'ENOENT' });
  await rm(path.join(persistent, '.complete'));
  assert.equal(await syncBuildCache('restore', env, project), false);
});

test('compiler cache identity follows dependencies, configuration, public environment, service and action key but not CMS secrets', async t => {
  const { project, env } = await cacheFixture(t);
  const original = await buildCacheDirectory(env, project);
  assert.ok(original);
  assert.equal(await buildCacheDirectory({ ...env, PAYLOAD_SECRET: 'changed-private-fixture' }, project), original);
  for (const change of [{ NEXT_PUBLIC_SITE_URL: 'https://other.example' }, { NEXT_PUBLIC_FEATURE: 'changed' }, { RENDER_SERVICE_ID: 'srv-fixture' }, { NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString('base64') }]) {
    assert.notEqual(await buildCacheDirectory({ ...env, ...change }, project), original);
  }
  await writeFile(path.join(project, 'package-lock.json'), '{"lockfileVersion":3,"changed":true}');
  const dependenciesChanged = await buildCacheDirectory(env, project);
  assert.notEqual(dependenciesChanged, original);
  await writeFile(path.join(project, 'next.config.mjs'), 'export default { poweredByHeader: false };');
  assert.notEqual(await buildCacheDirectory(env, project), dependenciesChanged);
});

test('missing or unwritable compiler cache does not fail a deployment or save an empty cache', async t => {
  const { project, env } = await cacheFixture(t);
  assert.equal(await syncBuildCache('save', env, project), false);
  const persistent = await buildCacheDirectory(env, project);
  assert.ok(persistent);
  await assert.rejects(access(path.join(persistent, '.complete')), { code: 'ENOENT' });
  await writeFile(env.XDG_CACHE_HOME, 'not-a-directory');
  await mkdir(path.join(project, '.next', 'cache', 'turbopack'), { recursive: true });
  await writeFile(path.join(project, '.next', 'cache', 'turbopack', 'fixture'), 'compiler-fixture');
  assert.equal(await syncBuildCache('restore', env, project), false);
  assert.equal(await syncBuildCache('save', env, project), false);
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
