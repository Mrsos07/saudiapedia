import Link from 'next/link';
import { loginCopy } from '../../components/admin/login-copy';

export function CMSSetupPanel() {
  return (
    <main className="cms-setup-surface">
      <div className="cms-setup-card">
        <p className="cms-login-wordmark"><span lang="ar">موسوعة المملكة</span><span lang="en" dir="ltr">KINGDOM ENCYCLOPEDIA</span></p>
        <h1 className="cms-setup-title">إعداد نظام إدارة المحتوى</h1>
        {(['ar', 'en'] as const).map((locale) => (
          <section key={locale} className="cms-setup-section" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
            <h2>{loginCopy[locale].setupTitle}</h2>
            <p>{loginCopy[locale].setupDescription}</p>
            <p>{loginCopy[locale].setupHelp}</p>
            <Link href={`/${locale}`}>{loginCopy[locale].back}</Link>
          </section>
        ))}
      </div>
    </main>
  );
}