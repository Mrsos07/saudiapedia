export class HTTPRequestError extends Error {
  constructor(public readonly status: 400 | 403 | 408 | 413 | 415) {
    super('Request rejected.');
  }
}

export function checkMutationOrigin(request: Request, trustedOrigin: string): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const origin = request.headers.get('origin');
  if ((origin !== null && origin !== trustedOrigin) || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new HTTPRequestError(403);
  }
}

export async function boundRequestBody(request: Request, limit: number, timeout = 30000): Promise<Request> {
  const encoding = request.headers.get('content-encoding');
  if (encoding && encoding.toLowerCase() !== 'identity') throw new HTTPRequestError(415);
  const declared = request.headers.get('content-length');
  if (declared !== null && !/^\d+$/.test(declared)) throw new HTTPRequestError(400);
  if (declared !== null && Number(declared) > limit) throw new HTTPRequestError(413);
  if (!request.body) return request;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new HTTPRequestError(408)), timeout); });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), expired]);
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new HTTPRequestError(413);
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new Request(request, { body: bytes });
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error instanceof HTTPRequestError ? error : new HTTPRequestError(400);
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
