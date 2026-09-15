import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isLocale } from '@/lib/encyclopedia';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/encyclopedia';
import { PageViewTracker } from '@/components/page-view-tracker';
import '../globals.css';

export const metadata: Metadata = { icons: { icon: '/brand/saudi-map-logo.svg', apple: '/brand/saudi-map-logo.svg' } };
export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}><head>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
    {/* User-specified family and stylesheet, deliberately not loaded a second time with next/font. */}
    {/* eslint-disable-next-line @next/next/no-page-custom-font */}
    <link href="https://fonts.googleapis.com/css2?family=Zain:ital,wght@0,200;0,300;0,400;0,700;0,800;0,900;1,300;1,400&display=swap" rel="stylesheet" />
  </head><body><a className="skip-link" href="#main-content">{locale === 'ar' ? 'تخطَّ إلى المحتوى' : 'Skip to content'}</a><SiteHeader locale={locale} />{children}<SiteFooter locale={locale} /><PageViewTracker /></body></html>;
}