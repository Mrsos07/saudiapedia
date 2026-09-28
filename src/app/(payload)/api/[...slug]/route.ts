import { cmsConfigured } from '../../../../lib/cms';
import { boundRequestBody, checkMutationOrigin, HTTPRequestError } from '../../../../lib/http-security';
import { effectiveMethod, invalidatePublicContent, invalidatesPublicContent } from '../../../../lib/public-cache';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Context = { params: Promise<{ slug?: string[] }> };
type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'OPTIONS';

const responseHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
};

function unavailable(): Response {
  return Response.json({ error: 'CMS_UNAVAILABLE', message: 'CMS is unavailable.' }, {
    status: 503, headers: { ...responseHeaders, 'Retry-After': '60' },
  });
}

function handler(method: Method) {
  return async (request: Request, context: Context): Promise<Response> => {
    try {
      if (!cmsConfigured()) return unavailable();
      if (request.url.length > 8192) return Response.json({ error: 'REQUEST_REJECTED' }, { status: 414, headers: responseHeaders });
      const origin = process.env.CMS_SERVER_URL || (process.env.NODE_ENV !== 'production' ? 'http://localhost:3000' : '');
      if (!origin) return unavailable();
      checkMutationOrigin(request, origin);
      const { slug } = await context.params;
      if (!['GET', 'OPTIONS'].includes(method)) {
        const multipart = slug?.[0] === 'media' && /^multipart\/form-data(?:;|$)/i.test(request.headers.get('content-type') ?? '');
        request = await boundRequestBody(request, multipart ? 12 * 1024 * 1024 : 256 * 1024);
      }
      const [routes, { default: config }] = await Promise.all([
        import('@payloadcms/next/routes'), import('../../../../payload.config'),
      ]);
      const response = await routes[`REST_${method}`](config)(request, context);
      if (invalidatesPublicContent(effectiveMethod(method, request), slug?.[0], response.status)) invalidatePublicContent();
      if (response.status >= 500) return unavailable();
      for (const [key, value] of Object.entries(responseHeaders)) response.headers.set(key, value);
      return response;
    } catch (error) {
      return error instanceof HTTPRequestError
        ? Response.json({ error: 'REQUEST_REJECTED' }, { status: error.status, headers: responseHeaders })
        : unavailable();
    }
  };
}

export const GET = handler('GET');
export const POST = handler('POST');
export const PATCH = handler('PATCH');
export const PUT = handler('PUT');
export const DELETE = handler('DELETE');
export const OPTIONS = handler('OPTIONS');
