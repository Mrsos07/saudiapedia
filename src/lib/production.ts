export type DeploymentEnvironment = Record<string, string | undefined>;

function invalid(name: string): never {
  throw new Error(`Missing or invalid production setting: ${name}.`);
}

function required(env: DeploymentEnvironment, name: string): string {
  const value = env[name]?.trim();
  return value || invalid(name);
}

export function productionOrigin(value: string | undefined): string {
  try {
    const url = new URL(value ?? '');
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || url.pathname !== '/' || /^(localhost|127\.|\[::1\])/.test(url.hostname)
      || ![url.origin, `${url.origin}/`].includes(value ?? '')) return invalid('public HTTPS origin');
    return url.origin;
  } catch {
    return invalid('public HTTPS origin');
  }
}

export function deploymentOrigins(env: DeploymentEnvironment): DeploymentEnvironment {
  const origin = productionOrigin(env.NEXT_PUBLIC_SITE_URL || env.CMS_SERVER_URL || env.RENDER_EXTERNAL_URL);
  if (env.CMS_SERVER_URL && productionOrigin(env.CMS_SERVER_URL) !== origin) invalid('CMS_SERVER_URL must match NEXT_PUBLIC_SITE_URL');
  return { ...env, NODE_ENV: 'production', CMS_SERVER_URL: origin, NEXT_PUBLIC_SITE_URL: origin };
}

export function databaseConnectionOptions(env: DeploymentEnvironment, certificate?: string) {
  const connectionString = required(env, 'DATABASE_URL');
  try {
    const url = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || !url.password || url.hash) invalid('DATABASE_URL');
    decodeURIComponent(url.username);
    decodeURIComponent(url.password);
    if ((env.NODE_ENV === 'production' || certificate) && url.search) invalid('DATABASE_URL: remove query parameters; TLS is configured separately');
  } catch {
    return invalid('DATABASE_URL (use a PostgreSQL URL without TLS/query overrides)');
  }
  return {
    connectionString,
    ...(env.NODE_ENV === 'production' || certificate ? { ssl: { rejectUnauthorized: true, ...(certificate ? { ca: certificate } : {}) } } : {}),
  };
}

export function productionEnvironment(input: DeploymentEnvironment): DeploymentEnvironment {
  const env = deploymentOrigins(input);
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') invalid('NODE_TLS_REJECT_UNAUTHORIZED must not disable TLS verification');
  const secret = required(env, 'PAYLOAD_SECRET');
  if (secret.length < 32) invalid('PAYLOAD_SECRET');
  databaseConnectionOptions(env);
  const user = decodeURIComponent(new URL(required(env, 'DATABASE_URL')).username);
  if (user !== 'kingdom_runtime' && !user.startsWith('kingdom_runtime.')) invalid('DATABASE_URL must use the kingdom_runtime role');
  for (const name of ['CMS_DATABASE_CA_FILE', 'S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']) required(env, name);
  if (env.S3_ENDPOINT) {
    try {
      const url = new URL(env.S3_ENDPOINT);
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) invalid('S3_ENDPOINT');
    } catch { invalid('S3_ENDPOINT'); }
  }
  const key = required(env, 'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY');
  if (!/^[A-Za-z0-9+/]{43}=$/.test(key) || Buffer.from(key, 'base64').length !== 32) invalid('NEXT_SERVER_ACTIONS_ENCRYPTION_KEY');
  if (env.CMS_DB_PUSH && env.CMS_DB_PUSH !== 'false') invalid('CMS_DB_PUSH must be false');
  if (env.CMS_ALLOW_BOOTSTRAP && env.CMS_ALLOW_BOOTSTRAP !== 'false') invalid('CMS_ALLOW_BOOTSTRAP must be false for the existing database');
  for (const name of ['SITE_INDEXABLE', 'S3_FORCE_PATH_STYLE']) {
    if (env[name] !== undefined && !['true', 'false'].includes(env[name]!)) invalid(name);
  }
  for (const name of ['CMS_DATABASE_ADMIN_PASSWORD', 'CMS_MIGRATOR_PASSWORD', 'CMS_RUNTIME_PASSWORD']) {
    if (env[name]) invalid(`${name} must not be supplied to the web service`);
  }
  const port = env.PORT || '10000';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) invalid('PORT');
  return { ...env, PAYLOAD_SECRET: secret, NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: key, PORT: port, CMS_REQUIRED: 'true', CMS_DB_PUSH: 'false', CMS_ALLOW_BOOTSTRAP: 'false', SITE_INDEXABLE: env.SITE_INDEXABLE ?? 'false' };
}

export function productionBuildEnvironment(input: DeploymentEnvironment): DeploymentEnvironment {
  const env = deploymentOrigins(input);
  const key = required(env, 'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY');
  if (!/^[A-Za-z0-9+/]{43}=$/.test(key) || Buffer.from(key, 'base64').length !== 32) invalid('NEXT_SERVER_ACTIONS_ENCRYPTION_KEY');
  env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY = key;
  for (const key of ['DATABASE_URL', 'PAYLOAD_SECRET', 'CMS_DATABASE_ADMIN_PASSWORD', 'CMS_MIGRATOR_PASSWORD', 'CMS_RUNTIME_PASSWORD',
    'S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_ENDPOINT']) env[key] = '';
  return { ...env, CMS_REQUIRED: 'false', CMS_DB_PUSH: 'false', CMS_ALLOW_BOOTSTRAP: 'false', SITE_INDEXABLE: 'false' };
}

export function verifyDeploymentOrigin(builtOrigin: unknown, env: DeploymentEnvironment): void {
  if (builtOrigin !== deploymentOrigins(env).NEXT_PUBLIC_SITE_URL) invalid('public origin changed; rebuild before starting');
}
