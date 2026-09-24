import { revalidateTag, unstable_cache } from 'next/cache';

/** Shared across requests; only for anonymous, published CMS reads (never drafts or user-specific data). */
export const PUBLIC_CONTENT_TAG = 'public-cms-content';
/** Upper bound for writes that bypass the REST route, such as CLI Local API scripts or SQL repair. */
export const PUBLIC_CONTENT_TTL_SECONDS = 300;
const CONTENT_COLLECTIONS = new Set(['articles', 'media', 'categories', 'sections', 'authors', 'sources']);

export function publicCache<T>(read: () => Promise<T>, key: string): () => Promise<T> {
  return unstable_cache(read, [key], { tags: [PUBLIC_CONTENT_TAG], revalidate: PUBLIC_CONTENT_TTL_SECONDS });
}

/** Runs after Payload has committed the REST operation. Denied requests changed nothing. */
export function invalidatesPublicContent(method: string, collection: string | undefined, status: number): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method) && status !== 401 && status !== 403
    && collection !== undefined && CONTENT_COLLECTIONS.has(collection);
}

export function invalidatePublicContent(): void {
  revalidateTag(PUBLIC_CONTENT_TAG, { expire: 0 });
}
