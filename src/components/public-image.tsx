'use client';

import Image, { type ImageProps } from 'next/image';
import { isProtectedMedia, mediaImageLoader } from '../lib/media-image';

/** Static /images and /brand use Next's optimizer; approved CMS media uses the protected resize endpoint. */
export function PublicImage(props: ImageProps & { src: string }) {
  // eslint-disable-next-line jsx-a11y/alt-text -- alt is required by ImageProps and forwarded.
  return isProtectedMedia(props.src) ? <Image {...props} loader={mediaImageLoader} /> : <Image {...props} />;
}
