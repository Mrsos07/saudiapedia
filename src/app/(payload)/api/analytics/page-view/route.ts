import { sql } from '@payloadcms/db-postgres';
import {
  AnalyticsBodyError,
  analyticsOptOut,
  isTrustedAnalyticsRequest,
  readAnalyticsBody,
  riyadhDay,
  safeAnalyticsCount,
  trustedAnalyticsOrigins,
} from '../../../../../lib/analytics';
import { cmsConfigured } from '../../../../../lib/cms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const responseHeaders = {
  'Cache-Control': 'no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
};

function respond(status: number): Response {
  return status === 204 ? new Response(null, { status, headers: responseHeaders })
    : Response.json({ error: status === 503 ? 'Analytics unavailable.' : 'Invalid analytics request.' }, {
      status, headers: responseHeaders,
    });
}

/** Anonymous, global daily totals only. Browser origin checks are not bot
 * authentication: non-browser clients can forge counts. No IP-based state,
 * arbitrary dimensions, article lookup, or claim of unique visitors. */
export async function POST(request: Request): Promise<Response> {
  try {
    // A fully unconfigured demo performs no recording or Payload initialization.
    // Partial/broken configuration still fails with 503, never silently disabled.
    if (!cmsConfigured()) return respond(204);
    const origins = trustedAnalyticsOrigins(process.env.NEXT_PUBLIC_SITE_URL, process.env.CMS_SERVER_URL);
    if (!isTrustedAnalyticsRequest(request.headers, origins)) return respond(403);
    await readAnalyticsBody(request);
    if (analyticsOptOut(request.headers.get('dnt'), request.headers.get('sec-gpc'))) return respond(204);

    const [{ getPayload }, { default: config }] = await Promise.all([
      import('payload'), import('../../../../../payload.config'),
    ]);
    const payload = await getPayload({ config });
    // PageViews.dbName + schemaName in the existing postgresAdapter config.
    // Payload's generated columns: serial id, varchar day, numeric views,
    // timestamp(3) with time zone created_at/updated_at, unique day index.
    // No read/modify/write race and no request-controlled SQL identifiers.
    const result = await payload.db.drizzle.execute(sql`
      INSERT INTO "kingdom_cms"."page_views" AS daily ("day", "views", "created_at", "updated_at")
      VALUES (${riyadhDay()}, 1, now(), now())
      ON CONFLICT ("day") DO UPDATE
      SET "views" = daily."views" + 1, "updated_at" = now()
      WHERE daily."views" >= 0 AND daily."views" < ${Number.MAX_SAFE_INTEGER}
        AND daily."views" = trunc(daily."views")
      RETURNING "views"
    `);
    if (result.rows.length !== 1) throw new Error('Analytics write unavailable.');
    safeAnalyticsCount(result.rows[0].views);
    return respond(204);
  } catch (error: unknown) {
    // Never reveal configuration, SQL, database errors, or raw request data.
    return respond(error instanceof AnalyticsBodyError ? error.status : 503);
  }
}

function methodNotAllowed(): Response {
  return new Response(null, { status: 405, headers: { ...responseHeaders, Allow: 'POST' } });
}

export const GET = methodNotAllowed;
export const HEAD = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;