import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile, lstat, realpath, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { S3Client, HeadBucketCommand, HeadObjectCommand, GetObjectCommand, PutObjectCommand } = require(require.resolve('@aws-sdk/client-s3', { paths: [require.resolve('@payloadcms/storage-s3')] }));
const { Client } = require(require.resolve('pg', { paths: [require.resolve('@payloadcms/db-postgres')] }));
const project = 'vexushpbyvaoangxyqcm';
const bucket = 'saudiapedia-media';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export function safeMediaRecord(row) {
  return row && typeof row.filename === 'string' && /^[a-z0-9][a-z0-9._-]*\.webp$/.test(row.filename)
    && !row.filename.includes('..') && row.mime_type === 'image/webp'
    && Number.isSafeInteger(Number(row.filesize)) && Number(row.filesize) > 0 && Number(row.filesize) <= 10485760;
}

async function remoteBytes(s3, key, size, etag) {
  const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key, IfMatch: etag }));
  let length = 0;
  const chunks = [];
  for await (const chunk of result.Body) {
    length += chunk.length;
    if (length > size) { result.Body.destroy(); throw new Error('REMOTE_SIZE_MISMATCH'); }
    chunks.push(chunk);
  }
  if (length !== size) throw new Error('REMOTE_SIZE_MISMATCH');
  return Buffer.concat(chunks, length);
}

export async function transfer(mode, env = process.env) {
  if (!['copy', 'verify'].includes(mode)) throw new Error('INVALID_MODE');
  const endpoint = env.S3_ENDPOINT;
  if (![ `https://${project}.storage.supabase.co/storage/v1/s3`, `https://${project}.supabase.co/storage/v1/s3` ].includes(endpoint)
    || env.S3_BUCKET !== bucket || env.S3_FORCE_PATH_STYLE !== 'true') throw new Error('WRONG_STORAGE_TARGET');
  for (const key of ['DATABASE_URL', 'CMS_DATABASE_CA_FILE', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']) {
    if (!env[key]?.trim()) throw new Error('MISSING_CONFIGURATION');
  }
  const cmsOrigin = env.CMS_VERIFICATION_ORIGIN;
  if (cmsOrigin && !/^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(cmsOrigin)) throw new Error('INVALID_CMS_VERIFICATION_ORIGIN');
  const databaseURL = new URL(env.DATABASE_URL);
  if (databaseURL.hostname !== 'aws-0-ap-northeast-1.pooler.supabase.com' || decodeURIComponent(databaseURL.username) !== `kingdom_runtime.${project}`
    || databaseURL.search || env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('WRONG_DATABASE_TARGET');
  const db = new Client({ connectionString: env.DATABASE_URL, ssl: { ca: await readFile(env.CMS_DATABASE_CA_FILE, 'utf8'), rejectUnauthorized: true }, connectionTimeoutMillis: 15000, statement_timeout: 15000 });
  const s3 = new S3Client({ region: env.S3_REGION, endpoint, forcePathStyle: true, maxAttempts: 2,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
    requestHandler: { connectionTimeout: 5000, requestTimeout: 15000 },
  });
  let lock;
  const lockPath = path.join(root, '.editorial-staging', 'storage-transfer.lock');
  try {
    if (mode === 'copy') lock = await open(lockPath, 'wx', 0o600);
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    await db.connect();
    const inventory = await db.query('SELECT filename, mime_type, filesize FROM kingdom_cms.media ORDER BY id');
    const uploadRoot = await realpath(path.join(root, 'private-uploads'));
    const files = [];
    const keys = new Set();
    for (const row of inventory.rows) {
      if (!safeMediaRecord(row) || keys.has(row.filename)) throw new Error('INVALID_MEDIA_INVENTORY');
      keys.add(row.filename);
      const filename = path.join(uploadRoot, row.filename);
      const info = await lstat(filename);
      if (!info.isFile() || info.isSymbolicLink() || path.dirname(await realpath(filename)) !== uploadRoot || info.size !== Number(row.filesize)) throw new Error('LOCAL_FILE_MISMATCH');
      const bytes = await readFile(filename);
      files.push({ key: row.filename, bytes, digest: hash(bytes) });
    }
    if (!files.length) throw new Error('EMPTY_MEDIA_INVENTORY');
    let uploaded = 0;
    for (const file of files) {
      let head;
      try { head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: file.key })); }
      catch (error) { if (error?.$metadata?.httpStatusCode !== 404) throw error; }
      if (!head) {
        if (mode !== 'copy') throw new Error('REMOTE_FILE_MISSING');
        await s3.send(new PutObjectCommand({ Bucket: bucket, Key: file.key, Body: file.bytes, ContentType: 'image/webp', CacheControl: 'private, no-store', IfNoneMatch: '*' }));
        uploaded += 1;
        head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: file.key }));
      }
      if (head.ContentLength !== file.bytes.length || hash(await remoteBytes(s3, file.key, file.bytes.length, head.ETag)) !== file.digest) throw new Error('REMOTE_CONTENT_CONFLICT');
      if (cmsOrigin) {
        const response = await fetch(`${cmsOrigin}/api/media/file/${encodeURIComponent(file.key)}`, { redirect: 'manual', signal: AbortSignal.timeout(60000) });
        if (response.status !== 200 || !response.headers.get('cache-control')?.includes('no-store') || response.headers.get('x-content-type-options') !== 'nosniff'
          || hash(Buffer.from(await response.arrayBuffer())) !== file.digest) throw new Error('CMS_DELIVERY_MISMATCH');
      }
    }
    const key = encodeURIComponent(files[0].key);
    for (const url of [`${endpoint}/${bucket}/${key}`, `https://${project}.supabase.co/storage/v1/object/public/${bucket}/${key}`]) {
      const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
      await response.body?.cancel();
      if (![400, 401, 403, 404].includes(response.status)) throw new Error('ANONYMOUS_ACCESS_NOT_DENIED');
    }
    console.log(JSON.stringify({ bucket, region: env.S3_REGION, uploaded, verifiedFiles: files.length, cmsVerifiedFiles: cmsOrigin ? files.length : 0, anonymousAccessDenied: true, cmsDatabaseWrites: false }));
  } finally {
    s3.destroy();
    await db.end();
    if (lock) { await lock.close(); await unlink(lockPath); }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  transfer(process.argv[2]).catch(() => {
    console.error('Storage operation failed. No existing objects were intentionally overwritten or deleted. Check target, credentials and media inventory.');
    process.exitCode = 1;
  });
}
