import { sql } from '@payloadcms/db-postgres';
import { DefaultTemplate } from '@payloadcms/next/templates';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { AdminViewServerProps } from 'payload';
import { hasRole, roles } from '../../collections/access';
import {
  ANALYTICS_MIN_YEAR,
  ANALYTICS_TIME_ZONE,
  analyticsMonthDays,
  currentAnalyticsMonth,
  decodeDailyViews,
  parseAnalyticsMonth,
  riyadhDay,
  safeAnalyticsCount,
  totalAnalyticsCounts,
  weeksWithinMonth,
  type DailyViews,
  type MonthWeek,
} from '../../lib/analytics';
import { loginLanguage } from './login-copy';
import { LoginLanguageSwitch } from './login-language-switch';

export const analyticsCopy = {
  ar: {
    eyebrow: 'موسوعة المملكة · إحصاءات التحرير',
    title: 'الإحصاءات',
    introduction: 'تابع إنشاء وثائق المقالات والمشاهدات المسجلة، بتوقيت الرياض.',
    dashboard: 'لوحة التحرير',
    filters: 'الفترة الزمنية',
    month: 'الشهر',
    year: 'السنة',
    apply: 'عرض الإحصاءات',
    invalid: 'اختر شهرًا صحيحًا من ١ إلى ١٢ وسنة من ٢٠٢٠ إلى السنة الحالية. لا تُقبل القيم المكررة.',
    unavailable: 'تعذّر تحميل الإحصاءات. أعد المحاولة لاحقًا؛ لم تُستبدل الأخطاء بأصفار.',
    articles: 'وثائق المقالات المُنشأة',
    views: 'المشاهدات المسجلة',
    weeks: 'أسابيع ضمن الشهر المحدد',
    weekNote: 'فترات الأيام: ١–٧، ٨–١٤، ١٥–٢١، ٢٢–٢٨، ثم ٢٩ إلى نهاية الشهر إن وُجدت. ليست أسابيع تقويمية.',
    documentNote: 'العدد حسب صلاحيات حسابك وتاريخ إنشاء الوثيقة، ويشمل المسودات والمنشور المتاح لك. كل لغة وثيقة مستقلة؛ ليست أعداد موضوعات أو أزواج ترجمة مكتملة. الوثائق المحذوفة غير مشمولة.',
    daily: 'المشاهدات اليومية المسجلة',
    days: 'الأيام',
    day: 'اليوم بتوقيت الرياض',
    count: 'العدد',
    total: 'إجمالي الشهر المحدد',
    future: 'لم يأتِ بعد',
    live: 'لقطة عند تحميل الصفحة؛ الشهر الجاري غير مكتمل.',
    privacy: 'إجمالي عالمي يومي فقط، لا زوار فريدون ولا تقسيم حسب الصفحة أو اللغة. لا يرسل المتتبع مسارات أو كلمات بحث أو معرّفات أو ملفات ارتباط. تُحترم إشارات عدم التتبع والتحكم العام بالخصوصية.',
    limitations: 'يشمل فقط الصفحات المزوّدة بالمتتبع والطلبات المقبولة. الصفر يعني عدم وجود أحداث مسجلة، وليس إثباتًا لعمل التتبع. قد تُفقد مشاهدات بسبب الحجب أو فشل الطلبات، وقد تتكرر أو تُزوّر الأعداد؛ فحص المصدر لا يمنع تزوير عملاء خارج المتصفح.',
  },
  en: {
    eyebrow: 'Kingdom Encyclopedia · Editorial analytics',
    title: 'Analytics',
    introduction: 'Monitor article-document creation and recorded page views in Riyadh time.',
    dashboard: 'Editorial dashboard',
    filters: 'Reporting period',
    month: 'Month',
    year: 'Year',
    apply: 'Show analytics',
    invalid: 'Choose an integer month from 1 to 12 and a year from 2020 to the current year. Duplicate values are not accepted.',
    unavailable: 'Analytics could not be loaded. Try again later; errors have not been replaced with zeros.',
    articles: 'Article documents created',
    views: 'Recorded page views',
    weeks: 'Weeks within selected month',
    weekNote: 'Day ranges: 1–7, 8–14, 15–21, 22–28, then 29 to month end where applicable. These are not calendar weeks.',
    documentNote: 'Counts reflect your permissions and document creation dates, including accessible drafts and published records. Each language is a separate document; these are not topics or complete translation pairs. Deleted documents are excluded.',
    daily: 'Daily recorded page views',
    days: 'Days',
    day: 'Day in Riyadh time',
    count: 'Count',
    total: 'Selected month total',
    future: 'Not yet',
    live: 'Snapshot at page load; the current month is incomplete.',
    privacy: 'Global daily totals only, not unique visitors or page/language breakdowns. The tracker sends no paths, search terms, identifiers or cookies. Do Not Track and Global Privacy Control are respected.',
    limitations: 'Includes only instrumented pages and accepted requests. Zero means no recorded events, not proof that tracking was operational. Blocking or request failures can lose views; counts can repeat or be forged. Origin checks do not prevent forgery by non-browser clients.',
  },
} as const;

type Report = {
  weeks: (MonthWeek & { count: number })[];
  days: DailyViews[];
  articleTotal: number;
  viewTotal: number;
};

/** Register as an exact custom admin view at /analytics, with noindex metadata.
 * Auth comes ONLY from initPageResult.req; top-level user props are not trusted.
 * No cross-request cache. SQL aggregate reads intentionally bypass collection
 * access only after the staff guard; raw documents never reach a client boundary. */
export async function AnalyticsView(props: AdminViewServerProps) {
  const { req, visibleEntities, permissions, locale: contentLocale } = props.initPageResult;
  if (!req.user || !hasRole(req, roles)) redirect('/admin/login');

  const locale = loginLanguage(req.i18n.language);
  const copy = analyticsCopy[locale];
  const now = new Date();
  const today = riyadhDay(now);
  const current = currentAnalyticsMonth(now);
  const selected = parseAnalyticsMonth(props.searchParams ?? {}, now);
  const formPeriod = selected ?? current;
  const number = new Intl.NumberFormat(locale);
  const monthFormat = new Intl.DateTimeFormat(locale, { month: 'long', calendar: 'gregory', timeZone: ANALYTICS_TIME_ZONE });
  const periodFormat = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', calendar: 'gregory', timeZone: ANALYTICS_TIME_ZONE });
  const dayFormat = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', calendar: 'gregory', timeZone: ANALYTICS_TIME_ZONE });
  let report: Report | null = null;

  if (selected) {
    try {
      const weeks: Report['weeks'] = [];
      // Deliberately sequential: respect the small configured connection pool.
      for (const bucket of weeksWithinMonth(selected)) {
        const result = await req.payload.count({
          collection: 'articles',
          overrideAccess: false,
          user: req.user,
          req,
          where: { and: [
            { createdAt: { greater_than_equal: bucket.start } },
            { createdAt: { less_than: bucket.endExclusive } },
          ] },
        });
        weeks.push({ ...bucket, count: safeAnalyticsCount(result.totalDocs) });
      }
      const monthDays = analyticsMonthDays(selected);
      const result = await req.payload.db.drizzle.execute(sql`
        SELECT "day", "views" FROM "kingdom_cms"."page_views"
        WHERE "day" >= ${monthDays[0]} AND "day" <= ${monthDays[monthDays.length - 1]}
        ORDER BY "day" ASC
      `);
      const days = decodeDailyViews(result.rows, selected);
      report = {
        weeks, days,
        articleTotal: totalAnalyticsCounts(weeks.map((week) => week.count)),
        viewTotal: totalAnalyticsCounts(days.map((day) => day.views)),
      };
    } catch {
      // All-or-unavailable: no misleading partial report or failure-as-zero.
      report = null;
    }
  }

  return (
    <DefaultTemplate
      req={req} i18n={req.i18n} payload={req.payload} user={req.user}
      permissions={permissions} locale={contentLocale} params={props.params}
      searchParams={props.searchParams} visibleEntities={visibleEntities}
      viewType={props.viewType} viewActions={props.viewActions}
    >
      <meta name="robots" content="noindex, nofollow" />
      <section className="cms-analytics" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} aria-labelledby="analytics-title">
        <header className="cms-analytics__hero">
          <div className="cms-analytics__topbar"><p className="cms-analytics__eyebrow">{copy.eyebrow}</p><LoginLanguageSwitch /></div>
          <h1 id="analytics-title">{copy.title}</h1>
          <p>{copy.introduction}</p>
          <Link href="/admin">{copy.dashboard}</Link>
        </header>

        <form className="cms-analytics__filters" action="/admin/analytics" method="get">
          <fieldset>
            <legend>{copy.filters}</legend>
            <label htmlFor="analytics-month">{copy.month}</label>
            <select id="analytics-month" name="month" defaultValue={formPeriod.month} required>
              {Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{monthFormat.format(new Date(Date.UTC(formPeriod.year, index, 1)))}</option>)}
            </select>
            <label htmlFor="analytics-year">{copy.year}</label>
            <input id="analytics-year" name="year" type="number" min={ANALYTICS_MIN_YEAR} max={current.year} step="1" defaultValue={formPeriod.year} required />
            <button type="submit">{copy.apply}</button>
          </fieldset>
        </form>

        {!selected ? <p className="cms-analytics__notice" role="alert">{copy.invalid}</p>
          : !report ? <p className="cms-analytics__notice" role="alert">{copy.unavailable}</p>
            : <>
              <h2 className="cms-analytics__period">{periodFormat.format(new Date(Date.UTC(selected.year, selected.month - 1, 1)))}</h2>
              <p className="cms-analytics__muted">{copy.live}</p>
              <dl className="cms-analytics__metrics">
                <div className="cms-analytics__metric"><dt>{copy.articles}</dt><dd>{number.format(report.articleTotal)}</dd></div>
                <div className="cms-analytics__metric"><dt>{copy.views}</dt><dd>{number.format(report.viewTotal)}</dd></div>
              </dl>

              <section className="cms-analytics__panel" aria-labelledby="analytics-weeks-title">
                <h2 id="analytics-weeks-title">{copy.weeks}</h2>
                <p id="analytics-weeks-note" className="cms-analytics__muted">{copy.weekNote} {copy.documentNote}</p>
                <div className="cms-analytics__chart" aria-hidden="true">
                  {report.weeks.map((week) => <div className="cms-analytics__bar-row" key={week.firstDay}>
                    <span>{number.format(week.firstDay)}–{number.format(week.lastDay)}</span>
                    <meter className="cms-analytics__bar" min={0} max={Math.max(1, ...report.weeks.map((item) => item.count))} value={week.count} />
                    <span>{number.format(week.count)}</span>
                  </div>)}
                </div>
                <div className="cms-analytics__table-wrap">
                  <table className="cms-analytics__table" aria-describedby="analytics-weeks-note">
                    <caption>{copy.articles} — {copy.weeks}</caption>
                    <thead><tr><th scope="col">{copy.days}</th><th scope="col">{copy.count}</th></tr></thead>
                    <tbody>{report.weeks.map((week) => <tr key={week.firstDay}><th scope="row">{number.format(week.firstDay)}–{number.format(week.lastDay)}</th><td>{number.format(week.count)}</td></tr>)}</tbody>
                    <tfoot><tr><th scope="row">{copy.total}</th><td>{number.format(report.articleTotal)}</td></tr></tfoot>
                  </table>
                </div>
              </section>

              <section className="cms-analytics__panel" aria-labelledby="analytics-days-title">
                <h2 id="analytics-days-title">{copy.daily}</h2>
                <div className="cms-analytics__chart" aria-hidden="true">
                  {report.days.filter(({ day }) => day <= today).map(({ day, views }) => <div className="cms-analytics__bar-row" key={day}>
                    <span>{dayFormat.format(new Date(`${day}T00:00:00+03:00`))}</span>
                    <meter className="cms-analytics__bar" min={0} max={Math.max(1, ...report.days.map((item) => item.views))} value={views} />
                    <span>{number.format(views)}</span>
                  </div>)}
                </div>
                <div className="cms-analytics__table-wrap">
                  <table className="cms-analytics__table" aria-describedby="analytics-limitations">
                    <caption>{copy.daily}</caption>
                    <thead><tr><th scope="col">{copy.day}</th><th scope="col">{copy.views}</th></tr></thead>
                    <tbody>{report.days.map(({ day, views }) => <tr key={day}><th scope="row"><time dateTime={day}>{dayFormat.format(new Date(`${day}T00:00:00+03:00`))}</time></th><td>{day > today ? copy.future : number.format(views)}</td></tr>)}</tbody>
                    <tfoot><tr><th scope="row">{copy.total}</th><td>{number.format(report.viewTotal)}</td></tr></tfoot>
                  </table>
                </div>
              </section>
            </>}
        <aside className="cms-analytics__privacy"><p>{copy.privacy}</p><p id="analytics-limitations">{copy.limitations}</p></aside>
      </section>
    </DefaultTemplate>
  );
}