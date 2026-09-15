import { cmsConfigured } from '../../../../lib/cms';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Context = { params: Promise<{ slug?: string[] }> };
type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'OPTIONS';

function handler(method: Method) {
  return async (request: Request, context: Context): Promise<Response> => {
    if (!cmsConfigured()) {
      return Response.json({ error: 'CMS_UNAVAILABLE', message: 'CMS is not configured. See docs/cms.md.' }, {
        status: 503,
        headers: { 'Cache-Control': 'private, no-store', 'Retry-After': '60', 'X-Robots-Tag': 'noindex, nofollow' },
      });
    }
    const [routes, { default: config }] = await Promise.all([
      import('@payloadcms/next/routes'), import('../../../../payload.config'),
    ]);
    const response = await routes[`REST_${method}`](config)(request, context);
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return response;
  };
}

export const GET = handler('GET');
export const POST = handler('POST');
export const PATCH = handler('PATCH');
export const PUT = handler('PUT');
export const DELETE = handler('DELETE');
export const OPTIONS = handler('OPTIONS');