/** Shared, environment-free analytics helpers. Safe to import from the tracker. */
export const ANALYTICS_TIME_ZONE = 'Asia/Riyadh';
export const ANALYTICS_MIN_YEAR = 2020;
export const ANALYTICS_BODY_LIMIT = 512;
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

export type AnalyticsMonth = { month: number; year: number };
export type MonthWeek = {
  firstDay: number;
  lastDay: number;
  start: string;
  endExclusive: string;
};
export type DailyViews = { day: string; views: number };

export function riyadhDay(now = new Date()): string {
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid analytics date.');
  // Riyadh is UTC+03:00 with no DST throughout the supported reporting period.
  return new Date(now.getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
}

export function currentAnalyticsMonth(now = new Date()): AnalyticsMonth {
  const day = riyadhDay(now);
  return { year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) };
}

/** Reject arrays (duplicate GET values), whitespace, fractions and coercions. */
export function parseAnalyticsMonth(
  values: { month?: unknown; year?: unknown },
  now = new Date(),
): AnalyticsMonth | null {
  const current = currentAnalyticsMonth(now);
  const integer = (value: unknown, fallback: number): number | null => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) return null;
    const result = Number(value);
    return Number.isSafeInteger(result) ? result : null;
  };
  const month = integer(values.month, current.month);
  const year = integer(values.year, current.year);
  if (month === null || year === null || month < 1 || month > 12
    || year < ANALYTICS_MIN_YEAR || year > current.year) return null;
  return { month, year };
}

export function daysInAnalyticsMonth({ month, year }: AnalyticsMonth): number {
  if (!Number.isInteger(month) || month < 1 || month > 12
    || !Number.isInteger(year) || year < ANALYTICS_MIN_YEAR || year > 9999) {
    throw new Error('Invalid analytics month.');
  }
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function analyticsMonthDays(selected: AnalyticsMonth): string[] {
  const prefix = `${selected.year}-${String(selected.month).padStart(2, '0')}`;
  return Array.from({ length: daysInAnalyticsMonth(selected) }, (_, index) =>
    `${prefix}-${String(index + 1).padStart(2, '0')}`);
}

/** These are weeks WITHIN the selected month, not ISO/calendar weeks. */
export function weeksWithinMonth(selected: AnalyticsMonth): MonthWeek[] {
  const days = daysInAnalyticsMonth(selected);
  const midnight = (day: number): string =>
    new Date(Date.UTC(selected.year, selected.month - 1, day) - RIYADH_OFFSET_MS).toISOString();
  return [1, 8, 15, 22, 29].filter((firstDay) => firstDay <= days).map((firstDay) => {
    const lastDay = Math.min(firstDay + 6, days);
    return { firstDay, lastDay, start: midnight(firstDay), endExclusive: midnight(lastDay + 1) };
  });
}

export function validAnalyticsDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Raw PostgreSQL numeric/sum values can be strings. Never coerce null to zero. */
export function safeAnalyticsCount(value: unknown): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+(?:\.0+)?$/.test(value))) {
    throw new Error('Invalid analytics count.');
  }
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid analytics count.');
  return count;
}

export function totalAnalyticsCounts(values: readonly number[]): number {
  return values.reduce((total, value) => safeAnalyticsCount(total + safeAnalyticsCount(value)), 0);
}

/** Call only on a successful SQL result. Missing rows mean no recorded events,
 * not proof that tracking was installed or operational on that day. */
export function decodeDailyViews(rows: unknown, selected: AnalyticsMonth): DailyViews[] {
  const days = analyticsMonthDays(selected);
  if (!Array.isArray(rows) || rows.length > days.length) throw new Error('Invalid analytics rows.');
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || !('day' in row) || !('views' in row)
      || !validAnalyticsDay(row.day) || !days.includes(row.day) || counts.has(row.day)) {
      throw new Error('Invalid analytics row.');
    }
    counts.set(row.day, safeAnalyticsCount(row.views));
  }
  return days.map((day) => ({ day, views: counts.get(day) ?? 0 }));
}

/** Configuration must be an explicit HTTP(S) origin, never a request Host header.
 * A root trailing slash is accepted; credentials, paths, queries and fragments are not. */
export function parseAnalyticsOrigin(value: unknown): string | null {
  if (typeof value !== 'string' || !value || value !== value.trim()
    || !/^https?:\/\//.test(value) || /[\\\s?#]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (!url.hostname || url.username || url.password || url.pathname !== '/') return null;
    // Do not silently normalize a path, default port or noncanonical hostname.
    return value === url.origin || value === `${url.origin}/` ? url.origin : null;
  } catch {
    return null;
  }
}

export function trustedAnalyticsOrigins(siteURL: string | undefined, cmsURL: string | undefined): string[] {
  const origins = [siteURL, cmsURL].filter((value): value is string => value !== undefined && value !== '');
  if (!origins.length) throw new Error('Analytics origin is not configured.');
  return [...new Set(origins.map((value) => {
    const origin = parseAnalyticsOrigin(value);
    if (!origin) throw new Error('Invalid analytics origin configuration.');
    return origin;
  }))];
}

export function isTrustedAnalyticsRequest(headers: Headers, origins: readonly string[]): boolean {
  const origin = headers.get('origin');
  const mode = headers.get('sec-fetch-mode');
  return origin !== null && origins.includes(origin) && parseAnalyticsOrigin(origin) === origin
    && headers.get('sec-fetch-site') === 'same-origin'
    && (mode === 'cors' || mode === 'same-origin')
    && headers.get('sec-fetch-dest') === 'empty';
}

export function analyticsOptOut(dnt: unknown, gpc: unknown): boolean {
  return dnt === '1' || dnt === 'yes' || gpc === true || gpc === '1';
}

/** Syntax only, not CMS eligibility. Mount only in successfully resolved public
 * pages, never in a catch-all layout that also renders 404s or previews.
 * Sections are administrator-managed (see the `sections` collection), so this
 * cannot hardcode a fixed list of section names; it validates the URL SHAPE
 * (locale + up to two slug segments) instead of a specific allowed section
 * name, and still excludes known non-content routes like search. This
 * intentionally trades some precision for not requiring a database lookup on
 * every client-side navigation. */
const excludedAnalyticsFirstSegments = new Set(['search', 'admin', 'api']);
export function isTrackableAnalyticsPath(pathname: unknown): pathname is string {
  if (typeof pathname !== 'string' || pathname.length > 512) return false;
  const match = /^\/(?:ar|en)(?:\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?)?$/.exec(pathname);
  return match !== null && (match[1] === undefined || !excludedAnalyticsFirstSegments.has(match[1]));
}

export class AnalyticsBodyError extends Error {
  constructor(public readonly status: 400 | 413 | 415) {
    super('Invalid analytics request.');
  }
}

/** Enforce the actual streamed byte count, independent of Content-Length. */
export async function readAnalyticsBody(request: Request): Promise<void> {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '')
    || (request.headers.has('content-encoding') && request.headers.get('content-encoding') !== 'identity')) {
    throw new AnalyticsBodyError(415);
  }
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) throw new AnalyticsBodyError(400);
    if (Number(declaredLength) > ANALYTICS_BODY_LIMIT) throw new AnalyticsBodyError(413);
  }
  if (!request.body) throw new AnalyticsBodyError(400);
  const reader = request.body.getReader();
  const bytes = new Uint8Array(ANALYTICS_BODY_LIMIT);
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (length + value.byteLength > ANALYTICS_BODY_LIMIT) throw new AnalyticsBodyError(413);
      bytes.set(value, length);
      length += value.byteLength;
    }
    const body: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length)));
    if (body === null || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 0) {
      throw new AnalyticsBodyError(400);
    }
  } catch (error: unknown) {
    // Cancellation must not wait for a misbehaving producer to finish.
    void reader.cancel().catch(() => undefined);
    throw error instanceof AnalyticsBodyError ? error : new AnalyticsBodyError(400);
  } finally {
    reader.releaseLock();
  }
}