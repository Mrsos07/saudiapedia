import type { ImageLoaderProps } from 'next/image';

/** Fixed allowlist: arbitrary widths would let anyone force unbounded resize work and cache entries. */
export const MEDIA_WIDTHS = [256, 384, 640, 828, 1080, 1280, 1920] as const;
const MEDIA_PATH = /^\/api\/media\/file\/[^/?#]+$/;

export function isProtectedMedia(src: string): boolean {
  return MEDIA_PATH.test(src);
}

export function mediaWidth(width: number): number {
  return MEDIA_WIDTHS.find((allowed) => allowed >= width) ?? MEDIA_WIDTHS[MEDIA_WIDTHS.length - 1];
}

/** Used instead of /_next/image, whose shared cache must never receive protected media. */
export function mediaImageLoader({ src, width }: ImageLoaderProps): string {
  return `${src}?w=${mediaWidth(width)}`;
}

export function requestedMediaWidth(value: string | null | undefined): number | null {
  // One canonical spelling per width, so 0640 cannot become a second cache key for 640.
  if (!value || !/^[1-9]\d{0,3}$/.test(value)) return null;
  const width = Number(value);
  return (MEDIA_WIDTHS as readonly number[]).includes(width) ? width : null;
}
