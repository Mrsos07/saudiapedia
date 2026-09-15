import type { Access, PayloadRequest, Where } from 'payload';

export const roles = ['administrator', 'editor', 'translator', 'reviewer'] as const;
export type Role = (typeof roles)[number];

export function hasRole(req: Pick<PayloadRequest, 'user'>, allowed: readonly Role[]): boolean {
  return req.user?.collection === 'users' && allowed.includes(req.user.role as Role);
}

export const isAdmin: Access = ({ req }) => hasRole(req, ['administrator']);
export const isStaff: Access = ({ req }) => hasRole(req, roles);
export const canReview = (req: Pick<PayloadRequest, 'user'>) =>
  hasRole(req, ['administrator', 'reviewer']);

export const publishedArticleWhere: Where = {
  and: [{ _status: { equals: 'published' } }, { reviewStatus: { equals: 'approved' } }],
};

export function validHTTPURL(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export const validateURL = (value: unknown): true | string =>
  validHTTPURL(value) || 'Enter an absolute HTTP(S) URL without embedded credentials.';

export const nonEmpty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;