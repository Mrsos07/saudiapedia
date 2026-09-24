import { cache } from 'react';
import { getCMSEntries } from './cms';
import { entries } from './encyclopedia';

// Cached across requests; REST writes to content collections expire it, so publishing and
// unpublishing are reflected on the next request (other writes within PUBLIC_CONTENT_TTL_SECONDS).
// A configured but unavailable database is an error, never a reason to show seed data.
export const getContent = cache(async () => {
  const published = await getCMSEntries();
  return { entries: published ?? entries, preview: published === null };
});