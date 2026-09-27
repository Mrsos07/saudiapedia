import sharp from 'sharp';
import type { CollectionConfig, Plugin } from 'payload';
import { requestedMediaWidth } from './media-image';

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

const VARIANT_HEADERS_DROPPED = new Set(['content-length', 'content-type', 'etag', 'content-range', 'accept-ranges', 'last-modified']);

/** Smaller WebP for an allowlisted width; keeps the original when it is already as small. */
export async function resizeMedia(original: CachedMedia, width: number): Promise<CachedMedia> {
  const input = Buffer.from(original.bytes.buffer, original.bytes.byteOffset, original.bytes.byteLength);
  const output = await sharp(input, { limitInputPixels: 40000000 })
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 72, effort: 4 })
    .toBuffer();
  if (output.byteLength >= original.bytes.byteLength) return original;
  const headers = original.headers.filter(([name]) => !VARIANT_HEADERS_DROPPED.has(name.toLowerCase()));
  headers.push(['content-type', 'image/webp'], ['content-length', String(output.byteLength)]);
  return { bytes: new Uint8Array(output), headers };
}

const serve = (media: CachedMedia) => new Response(media.bytes, { status: 200, headers: media.headers });

/** Wraps the storage handler, which Payload calls only after its per-request file access check. */
export function cachePublicMedia(handler: UploadHandler, cache = new MediaCache()): UploadHandler {
  const resizing = new Map<string, Promise<CachedMedia>>();
  const variant = (key: string, original: CachedMedia, width: number) => {
    const variantKey = `${key}#w${width}`;
    const hit = cache.get(variantKey);
    if (hit) return Promise.resolve(hit);
    let pending = resizing.get(variantKey);
    if (!pending) {
      pending = resizeMedia(original, width)
        .then((media) => { cache.set(variantKey, media); return media; })
        .catch(() => original)
        .finally(() => resizing.delete(variantKey));
      resizing.set(variantKey, pending);
    }
    return pending;
  };
  // Payload's handler type is a union of sync/async returns; an async function yields Promise<Response | void>.
  const cached = (async (req, args) => {
    const key = publicMediaKey(args.doc, args.params.filename);
    if (!key || req.headers.get('range') || req.headers.get('if-none-match')) return handler(req, args);
    const width = requestedMediaWidth(req.searchParams?.get('w'));
    let original = cache.get(key);
    if (!original) {
      const response = await handler(req, args);
      if (!(response instanceof Response)) return;
      if (response.status !== 200 || !response.body) return response;
      const length = Number(response.headers.get('content-length'));
      if (!Number.isSafeInteger(length) || length < 1 || length > MAX_ITEM_BYTES) return response;
      try {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength !== length) throw new Error('Incomplete media read.');
        original = { bytes, headers: [...response.headers] };
        cache.set(key, original);
      } catch (error) {
        // The browser left while storage was still sending; nobody receives this response.
        if (req.signal?.aborted) return new Response(null, { status: 499 });
        throw error;
      }
    }
    return serve(width ? await variant(key, original, width) : original);
  }) as UploadHandler;
  return cached;
}

export const publicMediaCache: Plugin = (config) => ({
  ...config,
  collections: config.collections?.map((collection) => collection.slug !== 'media' || typeof collection.upload !== 'object' || !collection.upload.handlers?.length
    ? collection
    : { ...collection, upload: { ...collection.upload, handlers: collection.upload.handlers.map((handler) => cachePublicMedia(handler)) } }),
});
