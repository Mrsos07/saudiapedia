import assert from 'node:assert/strict';
import { getPayload } from 'payload';
import config from '../src/payload.config';

// Explicit integration check: uses the restricted runtime role, never creates accounts.
const payload = await getPayload({ config });
try {
  const articles = await payload.find({ collection: 'articles', overrideAccess: false, user: null,
    draft: false, depth: 0, limit: 1, where: { and: [
      { _status: { equals: 'published' } }, { reviewStatus: { equals: 'approved' } },
    ] } });
  assert.ok(Array.isArray(articles.docs));
  const media = await payload.find({ collection: 'media', overrideAccess: false, user: null, depth: 0, limit: 1 });
  assert.ok(Array.isArray(media.docs));
  for (const collection of ['users', 'sources', 'categories', 'authors'] as const) {
    await assert.rejects(
      payload.find({ collection, overrideAccess: false, user: null, depth: 0, limit: 1 }),
      (error: unknown) => typeof error === 'object' && error !== null && 'status' in error && error.status === 403,
    );
  }
  console.log(JSON.stringify({ payloadRuntimeConnected: true, anonymousPublishedArticlesReadable: true,
    anonymousReleasedMediaReadable: true, anonymousUsersDenied: true, anonymousSourcesDenied: true,
    anonymousCategoriesDenied: true, anonymousAuthorsDenied: true, writesPerformed: false }));
} finally {
  await payload.destroy();
}

// Standalone CLI only: Payload can retain background handles after destroy.
// Reached only after every assertion and cleanup succeeds; exceptions remain failures.
process.exit(0);