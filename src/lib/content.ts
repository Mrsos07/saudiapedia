import { cache } from 'react';
import { getCMSEntries } from './cms';
import { entries } from './encyclopedia';

// Request-scoped only: publishing and unpublishing are reflected on the next request.
// A configured but unavailable database is an error, never a reason to show seed data.
export const getContent = cache(async () => {
  const published = await getCMSEntries();
  return { entries: published ?? entries, preview: published === null };
});