import { defaultLoggerOptions, type Payload } from 'payload';
import type { LoggerOptions } from 'pino';

/** Payload's S3 reader aborts its AWS SDK call when the browser cancels the request (navigation, reload, lazy image). */
export function isClientAbort(value: unknown): boolean {
  return typeof value === 'object' && value !== null && (value as { name?: unknown }).name === 'AbortError' && '$metadata' in value;
}

const options: LoggerOptions = {
  hooks: {
    logMethod(args, method, level) {
      if (level >= 50 && isClientAbort(args[0])) return this.debug('Client closed the request before storage responded.');
      return method.apply(this, args);
    },
  },
};

/** Keeps Payload's default pretty output; storage timeouts and other errors are still logged as errors. */
export const payloadLogger = { options, destination: defaultLoggerOptions };

type ObservablePool = { on(event: 'error', listener: (error: unknown) => void): unknown; listenerCount(event: 'error'): number };

/** pg-pool emits idle-connection failures on the pool; without a listener Node treats them as a fatal crash. */
export function observeDatabasePool(payload: Pick<Payload, 'db' | 'logger'>): void {
  const pool = (payload.db as unknown as { pool?: ObservablePool }).pool;
  if (!pool || pool.listenerCount('error') > 0) return;
  pool.on('error', (error) => {
    const code = typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string' ? (error as { code: string }).code : undefined;
    payload.logger.warn({ code }, 'Idle database connection closed; the pool replaces it on the next query.');
  });
}
