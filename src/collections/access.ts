import type { Access, CollectionBeforeOperationHook, PayloadRequest, Where } from 'payload';

export const roles = ['administrator', 'editor', 'translator', 'reviewer'] as const;
export type Role = (typeof roles)[number];

export function hasRole(req: Pick<PayloadRequest, 'user'>, allowed: readonly Role[]): boolean {
  return req.user?.collection === 'users' && allowed.includes(req.user.role as Role);
}

export const isAdmin: Access = ({ req }) => hasRole(req, ['administrator']);
export const isStaff: Access = ({ req }) => hasRole(req, roles);
export const canReview = (req: Pick<PayloadRequest, 'user'>) =>
  hasRole(req, ['administrator', 'reviewer']);

export const boundPublicReads: CollectionBeforeOperationHook = ({ args, operation, req }) => {
  if (operation === 'find' && !hasRole(req, roles)) {
    const options = args as { limit?: number; depth?: number; pagination?: boolean };
    const limit = typeof options.limit === 'number' && Number.isFinite(options.limit) ? options.limit : 10;
    options.limit = limit === 0 ? 100 : Math.max(1, Math.min(100, Math.trunc(limit)));
    options.depth = Math.max(0, Math.min(2, typeof options.depth === 'number' && Number.isFinite(options.depth) ? options.depth : 1));
    options.pagination = true;
  }
  return args;
};

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