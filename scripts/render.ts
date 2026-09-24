import { spawn } from 'node:child_process';
import { createHash, X509Certificate } from 'node:crypto';
import { cp, lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { productionEnvironment, productionBuildEnvironment, verifyDeploymentOrigin, type DeploymentEnvironment } from '../src/lib/production';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = path.join(root, '.next', 'render-origin.json');
const actionKeyHash = (env: DeploymentEnvironment) => createHash('sha256').update(env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY!).digest('hex');

export async function buildCacheDirectory(env: DeploymentEnvironment, projectRoot = root): Promise<string | null> {
  if (env.RENDER !== 'true' || !env.XDG_CACHE_HOME || !path.isAbsolute(env.XDG_CACHE_HOME)) return null;
  const files = await Promise.all(['package-lock.json', 'next.config.mjs'].map(file => readFile(path.join(projectRoot, file))));
  const settings = Object.entries(env).filter(([name]) => name.startsWith('NEXT_PUBLIC_')
    || ['CMS_SERVER_URL', 'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY', 'RENDER_SERVICE_ID'].includes(name)).sort(([a], [b]) => a.localeCompare(b));
  const hash = createHash('sha256').update(JSON.stringify([process.platform, process.arch, process.versions.node, settings]));
  for (const file of files) hash.update(file);
  return path.join(env.XDG_CACHE_HOME, 'saudiapedia-next-build', 'v1-' + hash.digest('hex'));
}

export async function syncBuildCache(direction: 'restore' | 'save', env: DeploymentEnvironment, projectRoot = root): Promise<boolean> {
  try {
    const persistent = await buildCacheDirectory(env, projectRoot);
    if (!persistent) return false;
    const local = path.join(projectRoot, '.next', 'cache');
    const marker = path.join(persistent, '.complete');
    if (direction === 'restore' && await readFile(marker, 'utf8').catch(error => {
      if (error.code !== 'ENOENT') throw error;
      return '';
    }) !== 'v1') {
      console.log('No matching Render compiler cache; building a fresh cache.');
      return false;
    }
    const [source, destination] = direction === 'restore' ? [persistent, local] : [local, persistent];
    const entries: string[] = [];
    for (const entry of ['turbopack', 'swc', 'webpack', '.tsbuildinfo']) {
      const stat = await lstat(path.join(source, entry)).catch(error => {
        if (error.code !== 'ENOENT') throw error;
        return null;
      });
      if (stat?.isDirectory() || stat?.isFile()) entries.push(entry);
    }
    if (!entries.length) return false;
    await mkdir(destination, { recursive: true, mode: 0o700 });
    if (direction === 'save') await rm(marker, { force: true });
    for (const entry of entries) {
      await cp(path.join(source, entry), path.join(destination, entry), {
        recursive: true, filter: async file => !(await lstat(file)).isSymbolicLink(),
      });
    }
    if (direction === 'save') await writeFile(marker, 'v1', { mode: 0o600 });
    console.log(direction === 'restore' ? 'Restored Render compiler cache.' : 'Saved Render compiler cache.');
    return true;
  } catch {
    console.warn('Render compiler cache unavailable; continuing without cache synchronization.');
    return false;
  }
}

function runNext(args: string[], env: DeploymentEnvironment): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), ...args], { cwd: root, env: { ...env, NODE_ENV: 'production' }, stdio: 'inherit' });
    const terminate = () => { child.kill('SIGTERM'); };
    const interrupt = () => { child.kill('SIGINT'); };
    process.on('SIGTERM', terminate);
    process.on('SIGINT', interrupt);
    const cleanup = () => { process.off('SIGTERM', terminate); process.off('SIGINT', interrupt); };
    child.once('error', error => { cleanup(); reject(error); });
    child.once('exit', (code, signal) => { cleanup(); resolve(code ?? (signal === 'SIGINT' ? 130 : 143)); });
  });
}

export async function renderCommand(command: string | undefined, input: DeploymentEnvironment): Promise<number> {
  if (command === 'build') {
    const env = productionBuildEnvironment(input);
    await syncBuildCache('restore', env);
    const code = await runNext(['build'], env);
    if (code === 0) {
      await writeFile(manifest, JSON.stringify({ origin: env.NEXT_PUBLIC_SITE_URL, actionKeyHash: actionKeyHash(env) }) + '\n', { mode: 0o600 });
      await syncBuildCache('save', env);
    }
    return code;
  }
  if (command !== 'start' && command !== 'check') throw new Error('Use render:build, render:start or render:check.');
  const env = productionEnvironment(input);
  if (command === 'check') {
    console.log('Production environment is valid. Database, certificate file and storage connectivity have not been tested.');
    return 0;
  }
  try { new X509Certificate(await readFile(env.CMS_DATABASE_CA_FILE!)); }
  catch { throw new Error('Missing or invalid production setting: CMS_DATABASE_CA_FILE certificate.'); }
  let built: { origin?: unknown; actionKeyHash?: unknown };
  try { built = JSON.parse(await readFile(manifest, 'utf8')) as { origin?: unknown; actionKeyHash?: unknown }; }
  catch { throw new Error('Missing or invalid production setting: build metadata. Run render:build first.'); }
  verifyDeploymentOrigin(built.origin, env);
  if (built.actionKeyHash !== actionKeyHash(env)) throw new Error('Missing or invalid production setting: Server Actions key changed; rebuild before starting.');
  return runNext(['start', '--hostname', '0.0.0.0', '--port', env.PORT!], env);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  renderCommand(process.argv[2], process.env).then(code => { process.exitCode = code; }).catch((error: unknown) => {
    console.error(error instanceof Error && error.message.startsWith('Missing or invalid production setting:')
      ? error.message : 'Render command failed. Verify the production settings and build; no credentials were logged.');
    process.exitCode = 1;
  });
}
