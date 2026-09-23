import { productionEnvironment } from '../../../../lib/production';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

let pending: Promise<boolean> | undefined;

function check(): Promise<boolean> {
  if (!pending) {
    pending = (async () => {
      productionEnvironment(process.env);
      const [{ getPayload }, { default: config }, { sql }] = await Promise.all([
        import('payload'), import('../../../../payload.config'), import('@payloadcms/db-postgres'),
      ]);
      const payload = await getPayload({ config });
      const result = await payload.db.drizzle.execute(sql`
        SELECT EXISTS (SELECT 1 FROM "kingdom_cms"."users" WHERE "role" = 'administrator')
          AND to_regclass('kingdom_cms.articles') IS NOT NULL
          AND to_regclass('kingdom_cms.media') IS NOT NULL
          AND to_regclass('kingdom_cms.sections') IS NOT NULL
          AND to_regclass('kingdom_cms.page_views') IS NOT NULL AS ready
      `);
      return result.rows[0]?.ready === true;
    })().catch(() => false).finally(() => { pending = undefined; });
  }
  return pending;
}

export async function GET(): Promise<Response> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const ready = await Promise.race([check(), new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 3500); })]);
    return Response.json({ status: ready ? 'ok' : 'unavailable' }, {
      status: ready ? 200 : 503,
      headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' },
    });
  } finally { clearTimeout(timer); }
}
