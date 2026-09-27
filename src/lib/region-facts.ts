import type { Localized } from './encyclopedia';

/** Saudi Census 2022 (GASTAT, reference date 10 May 2022), total residents by administrative region.
 * Retrieved via GLMM's reproduction of the census portal table (accessed by GLMM 15 June 2023);
 * Makkah and Madinah match Saudipedia's census citations. Some secondary summaries redistribute
 * about 251,000 residents between Makkah and Madinah; those figures are not used here. */
export const CENSUS_2022 = {
  total: 32175224,
  source: {
    title: { ar: 'تعداد السعودية 2022، الهيئة العامة للإحصاء', en: 'Saudi Census 2022, General Authority for Statistics' },
    url: 'https://portal.saudicensus.sa/portal/public/1/15?type=TABLE',
  },
} as const;

type RegionFact = { seat: Localized; population: number };

export const REGION_FACTS: Readonly<Record<string, RegionFact>> = {
  riyadh: { seat: { ar: 'الرياض', en: 'Riyadh' }, population: 8591748 },
  makkah: { seat: { ar: 'مكة المكرمة', en: 'Makkah' }, population: 8021463 },
  'eastern-province': { seat: { ar: 'الدمام', en: 'Dammam' }, population: 5125254 },
  madinah: { seat: { ar: 'المدينة المنورة', en: 'Madinah' }, population: 2137983 },
  asir: { seat: { ar: 'أبها', en: 'Abha' }, population: 2024285 },
  jazan: { seat: { ar: 'جازان', en: 'Jazan' }, population: 1404997 },
  qassim: { seat: { ar: 'بريدة', en: 'Buraidah' }, population: 1336179 },
  tabuk: { seat: { ar: 'تبوك', en: 'Tabuk' }, population: 886036 },
  hail: { seat: { ar: 'حائل', en: 'Hail' }, population: 746406 },
  jawf: { seat: { ar: 'سكاكا', en: 'Sakaka' }, population: 595822 },
  najran: { seat: { ar: 'نجران', en: 'Najran' }, population: 592300 },
  'northern-borders': { seat: { ar: 'عرعر', en: 'Arar' }, population: 373577 },
  bahah: { seat: { ar: 'الباحة', en: 'Al Bahah' }, population: 339174 },
};

/** 1-based rank by population and share of the national total, in percent. */
export function regionStatistics(slug: string): { population: number; rank: number; share: number; seat: Localized } | null {
  const fact = REGION_FACTS[slug];
  if (!fact) return null;
  const rank = 1 + Object.values(REGION_FACTS).filter((other) => other.population > fact.population).length;
  return { ...fact, rank, share: (fact.population / CENSUS_2022.total) * 100 };
}
