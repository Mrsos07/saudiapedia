import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isLocale } from '@/lib/encyclopedia';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/encyclopedia';
import { PageViewTracker } from '@/components/page-view-tracker';
import { getSections } from '@/lib/sections';
import { publicNavigation } from '@/lib/site';
import '../globals.css';

// Raster icons first: search engines need a square favicon of at least 48 px (built by scripts/build-brand-assets.mjs).
export const metadata: Metadata = { icons: {
  icon: [{ url: '/favicon.ico', sizes: '48x48' }, { url: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' }, { url: '/brand/icon-512.png', sizes: '512x512', type: 'image/png' }, { url: '/brand/saudi-map-logo.svg', type: 'image/svg+xml' }],
  apple: [{ url: '/brand/apple-touch-icon.png', sizes: '180x180' }],
} };
export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { sections } = await getSections();
  const navigation = publicNavigation(sections);
  return <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} suppressHydrationWarning><head>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
    {/* User-specified family and stylesheet, deliberately not loaded a second time with next/font. */}
    {/* eslint-disable-next-line @next/next/no-page-custom-font */}
    <link href="https://fonts.googleapis.com/css2?family=Zain:ital,wght@0,200;0,300;0,400;0,700;0,800;0,900;1,300;1,400&display=swap" rel="stylesheet" />
  </head><body><a className="skip-link" href="#main-content">{locale === 'ar' ? 'تخطَّ إلى المحتوى' : 'Skip to content'}</a><SiteHeader locale={locale} navigation={navigation} />{children}<SiteFooter locale={locale} navigation={navigation} /><PageViewTracker /></body></html>;
}