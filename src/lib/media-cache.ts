import type { CollectionConfig, Plugin } from 'payload';

type UploadHandler = NonNullable<Exclude<CollectionConfig['upload'], boolean | undefined>['handlers']>[number];
type CachedMedia = { bytes: Uint8Array<ArrayBuffer>; headers: [string, string][] };

export const MEDIA_CACHE_MAX_BYTES = 64 * 1024 * 1024;
const MAX_ITEM_BYTES = 10 * 1024 * 1024;

/** Process-local LRU of public media bytes. Never a shared/HTTP cache; responses keep their no-store headers. */
export class MediaCache {
  private readonly items = new Map<string, CachedMedia>();
  private total = 0;
  constructor(private readonly limit = MEDIA_CACHE_MAX_BYTES) {}

  get bytes(): number { return this.total; }

  get(key: string): CachedMedia | undefined {
    const item = this.items.get(key);
    if (item) { this.items.delete(key); this.items.set(key, item); }
    return item;
  }

  set(key: string, item: CachedMedia): void {
    if (item.bytes.byteLength > this.limit) return;
    this.remove(key);
    this.items.set(key, item);
    this.total += item.bytes.byteLength;
    for (const oldest of this.items.keys()) {
      if (this.total <= this.limit) break;
      this.remove(oldest);
    }
  }

  private remove(key: string): void {
    const item = this.items.get(key);
    if (!item) return;
    this.items.delete(key);
    this.total -= item.bytes.byteLength;
  }
}

/** Only approved public assets; any edit changes updatedAt, so replaced bytes never reuse an entry. */
export function publicMediaKey(doc: unknown, filename: string | undefined): string | null {
  if (!doc || typeof doc !== 'object') return null;
  const { published, filename: stored, updatedAt, filesize } = doc as Record<string, unknown>;
  const version = updatedAt instanceof Date ? updatedAt.toISOString() : updatedAt;
  if (published !== true || typeof stored !== 'string' || !stored || stored !== filename || typeof version !== 'string' || !version) return null;
  return JSON.stringify([stored, version, typeof filesize === 'number' ? filesize : null]);
}

/** Wraps the storage handler, which Payload calls only after its per-request file access check. */
export function cachePublicMedia(handler: UploadHandler, cache = new MediaCache()): UploadHandler {
  // Payload's handler type is a union of sync/async returns; an async function yields Promise<Response | void>.
  const cached = (async (req, args) => {
    const key = publicMediaKey(args.doc, args.params.filename);
    if (!key || req.headers.get('range') || req.headers.get('if-none-match')) return handler(req, args);
    const hit = cache.get(key);
    if (hit) return new Response(hit.bytes, { status: 200, headers: hit.headers });
    const response = await handler(req, args);
    if (!(response instanceof Response)) return;
    if (response.status !== 200 || !response.body) return response;
    const length = Number(response.headers.get('content-length'));
    if (!Number.isSafeInteger(length) || length < 1 || length > MAX_ITEM_BYTES) return response;
    try {
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength !== length) throw new Error('Incomplete media read.');
      const headers = [...response.headers];
      cache.set(key, { bytes, headers });
      return new Response(bytes, { status: 200, headers });
    } catch (error) {
      // The browser left while storage was still sending; nobody receives this response.
      if (req.signal?.aborted) return new Response(null, { status: 499 });
      throw error;
    }
  }) as UploadHandler;
  return cached;
}

export const publicMediaCache: Plugin = (config) => ({
  ...config,
  collections: config.collections?.map((collection) => collection.slug !== 'media' || typeof collection.upload !== 'object' || !collection.upload.handlers?.length
    ? collection
    : { ...collection, upload: { ...collection.upload, handlers: collection.upload.handlers.map((handler) => cachePublicMedia(handler)) } }),
});
