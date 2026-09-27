import { headers } from 'next/headers';
import { serializeGraph } from '../lib/structured-data';

/** Carries the per-request CSP nonce from src/proxy.ts. */
export async function JsonLd({ graph }: { graph: Record<string, unknown>[] }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return <script nonce={nonce} type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeGraph(graph) }} />;
}
