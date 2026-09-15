import '@payloadcms/next/css';
import './admin.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import type { ServerFunctionClient } from 'payload';
import { cmsConfigured } from '../../lib/cms';
import { importMap } from './admin/importMap';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const metadata: Metadata = { robots: { index: false, follow: false } };

const serverFunction: ServerFunctionClient = async (args) => {
  'use server';
  if (!cmsConfigured()) throw new Error('CMS is unavailable. See docs/cms.md.');
  const [{ handleServerFunctions }, { default: config }] = await Promise.all([
    import('@payloadcms/next/layouts'), import('../../payload.config'),
  ]);
  return handleServerFunctions({ ...args, config, importMap });
};

export default async function CMSLayout({ children }: { children: ReactNode }) {
  if (!cmsConfigured()) {
    return (
      <html lang="ar" dir="rtl">
        <body style={{ margin: 0, padding: '1px 20px', fontFamily: 'Zain, sans-serif', fontSize: 20, color: '#1f2933', background: '#f4efe5', minHeight: '100vh' }}>{children}</body>
      </html>
    );
  }
  const [{ RootLayout }, { default: config }] = await Promise.all([
    import('@payloadcms/next/layouts'), import('../../payload.config'),
  ]);
  return <RootLayout config={config} importMap={importMap} serverFunction={serverFunction}>{children}</RootLayout>;
}