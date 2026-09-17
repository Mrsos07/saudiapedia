'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import type { Locale } from '@/lib/encyclopedia';
import { brand, navigationLabel, type NavigationItem } from '@/lib/site';

export function SiteHeader({ locale, navigation }: { locale: Locale; navigation: readonly NavigationItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const other = locale === 'ar' ? 'en' : 'ar';
  const otherPath = pathname.replace(/^\/(ar|en)(?=\/|$)/, `/${other}`);
  return <>
    <div className="top-strip"><div className="container"><span>{locale === 'ar' ? 'من جذور التاريخ، إلى آفاق المستقبل' : 'Rooted in history. Looking to the future.'}</span><span>{locale === 'ar' ? 'مشروع معرفي مستقل' : 'An independent knowledge project'}</span></div></div>
    <header className="site-header">
      <div className="container header-inner">
        <Link href={`/${locale}`} className="brand" aria-label={brand[locale]} onClick={() => setOpen(false)}>
          <Image src="/brand/saudi-map-logo.svg" alt="" width={61} height={52} priority />
          <span><strong>{brand[locale]}</strong><small>{locale === 'ar' ? 'تاريخٌ يُروى، ووطنٌ يُكتشف' : 'SAUDI ARABIA · DISCOVER & EXPLORE'}</small></span>
        </Link>
        <nav className="desktop-nav" aria-label={locale === 'ar' ? 'الأقسام الرئيسية' : 'Main navigation'}>
          {navigation.map(item => <Link key={item.path} href={`/${locale}/${item.path}`} title={item[locale]} aria-current={(pathname.split('/')[2] === item.path || (item.path === 'notable-figures' && ['people', 'rulers'].includes(pathname.split('/')[2]))) ? 'page' : undefined}>{navigationLabel(item, locale)}</Link>)}
        </nav>
        <div className="header-actions">
          <Link href={otherPath} className="language-link" lang={other} onClick={() => setOpen(false)}>{locale === 'ar' ? 'English' : 'العربية'}</Link>
          <Link href={`/${locale}/search`} className="header-search">{locale === 'ar' ? 'ابحث' : 'Search'}</Link>
          <button className="menu-toggle" type="button" aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen(!open)}>{locale === 'ar' ? (open ? 'إغلاق' : 'القائمة') : (open ? 'Close' : 'Menu')}</button>
        </div>
      </div>
      {open && <nav id="mobile-navigation" className="mobile-nav container" aria-label={locale === 'ar' ? 'قائمة الجوال' : 'Mobile navigation'}>{navigation.map(item => <Link key={item.path} href={`/${locale}/${item.path}`} title={item[locale]} onClick={() => setOpen(false)}>{navigationLabel(item, locale)}</Link>)}</nav>}
    </header>
  </>;
}