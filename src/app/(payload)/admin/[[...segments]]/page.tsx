import type { Metadata } from 'next';
import { cmsConfigured } from '../../../../lib/cms';
import { CMSSetupPanel } from '../../setup';
import { importMap } from '../importMap';

type Props = {
  params: Promise<{ segments: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] }>;
};

export const dynamic = 'force-dynamic';

export async function generateMetadata(props: Props): Promise<Metadata> {
  if (!cmsConfigured()) return { title: 'CMS setup | موسوعة المملكة', robots: { index: false, follow: false } };
  const [{ generatePageMetadata }, { default: config }] = await Promise.all([
    import('@payloadcms/next/views'), import('../../../../payload.config'),
  ]);
  return { ...await generatePageMetadata({ ...props, config }), robots: { index: false, follow: false } };
}

export default async function AdminPage(props: Props) {
  if (!cmsConfigured()) return <CMSSetupPanel />;
  const [{ RootPage }, { default: config }] = await Promise.all([
    import('@payloadcms/next/views'), import('../../../../payload.config'),
  ]);
  return RootPage({ ...props, config, importMap });
}