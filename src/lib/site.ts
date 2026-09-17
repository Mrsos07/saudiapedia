import type { Metadata } from 'next';
import type { Locale } from './encyclopedia';

export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
export const brand = { ar: 'موسوعة المملكة', en: 'Kingdom Encyclopedia' };
export const intro = { ar: 'نافذتك إلى تاريخ المملكة العربية السعودية، وتنوّع أرضها، وإرث إنسانها.', en: 'A window into Saudi Arabia’s history, diverse landscapes and human heritage.' };

export function pageMetadata(locale: Locale, title: string, description: string, path = '', noindex = false): Metadata {
  const url = `${siteUrl}/${locale}${path}`;
  return {
    metadataBase: new URL(siteUrl), title: `${title} | ${brand[locale]}`, description,
    alternates: { canonical: url, languages: { ar: `${siteUrl}/ar${path}`, en: `${siteUrl}/en${path}` } },
    robots: { index: !noindex && process.env.SITE_INDEXABLE === 'true', follow: true },
    openGraph: { title, description, url, siteName: brand[locale], locale: locale === 'ar' ? 'ar_SA' : 'en_US', type: 'website', images: [{ url: '/images/desert.jpg', width: 1920, height: 1280, alt: locale === 'ar' ? 'وادي العلا' : 'AlUla valley' }] },
    twitter: { card: 'summary_large_image', title, description, images: ['/images/desert.jpg'] },
  };
}

export const navigation = [
  { path: 'history', ar: 'التاريخ', en: 'History' },
  { path: 'regions', ar: 'الجغرافيا والمناطق', en: 'Regions' },
  { path: 'notable-figures', ar: 'شخصيات بارزة', en: 'Notable figures' },
  { path: 'heritage', ar: 'التراث', en: 'Heritage' },
] as const;

export type NavigationItem = { path: string; ar: string; en: string };

const compactLabels: Record<string, { ar: string; en: string }> = {
  regions: { ar: 'المناطق', en: 'Regions' },
  'notable-figures': { ar: 'الشخصيات', en: 'People' },
  economy: { ar: 'الاقتصاد', en: 'Economy' },
  nature: { ar: 'الطبيعة', en: 'Nature' },
  tourism: { ar: 'السياحة', en: 'Tourism' },
};

export function navigationLabel(item: NavigationItem, locale: Locale): string {
  return compactLabels[item.path]?.[locale] ?? item[locale];
}

export function publicNavigation(sections: readonly { slug: string; name: { ar: string; en: string } }[]): NavigationItem[] {
  const items = new Map<string, NavigationItem>();
  for (const section of sections) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(section.slug)
      || ['search', 'privacy', 'credits', 'about', 'editorial-policy', 'geography', 'admin', 'api'].includes(section.slug)) continue;
    const path = ['people', 'rulers'].includes(section.slug) ? 'notable-figures' : section.slug;
    if (!items.has(path)) items.set(path, navigation.find(item => item.path === path) ?? { path, ...section.name });
  }
  return [...items.values()];
}

export const photoCredits = [
  { file: 'desert.jpg', ar: 'وادي العلا وجروفه الصخرية', en: 'AlUla valley and sandstone escarpments', author: 'Sammy Six', source: 'https://commons.wikimedia.org/wiki/File:Al_Ula_(6748577917).jpg', license: 'CC BY 2.0', licenseUrl: 'https://creativecommons.org/licenses/by/2.0/' },
  { file: 'diriyah.jpg', ar: 'العمارة الطينية في الدرعية', en: 'Earthen architecture in Diriyah', author: 'Petrovic-Njegos', source: 'https://commons.wikimedia.org/wiki/File:Diriyahpic.jpg', license: 'CC BY 2.5', licenseUrl: 'https://creativecommons.org/licenses/by/2.5/' },
  { file: 'mountains.jpg', ar: 'منحدر صخري في منطقة عسير', en: 'A rocky slope in Asir', author: 'Aboluay', source: 'https://commons.wikimedia.org/wiki/File:AsirRockyMountain.jpg', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  { file: 'heritage.jpg', ar: 'واجهة مقبرة منحوتة في الحِجر', en: 'A rock-cut tomb facade at Hegra', author: 'Following Hadrian', source: "https://commons.wikimedia.org/wiki/File:27,_Hegra_(Mada%27in_Salih),_Saudi_Arabia.jpg", license: 'CC BY-SA 2.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/' },
  { file: 'riyadh.jpg', ar: 'أفق الرياض، فبراير 2018', en: 'Riyadh skyline, February 2018', author: 'B.alotaby', source: 'https://commons.wikimedia.org/wiki/File:Riyadh_Skyline.jpg', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' },
];