import Link from 'next/link';
import type { ServerProps } from 'payload';
import { loginCopy, loginLanguage } from './login-copy';
import { LoginLanguageSwitch } from './login-language-switch';

export function LoginLogo() {
  return <span className="cms-login-wordmark"><span lang="ar" dir="rtl">موسوعة المملكة</span><span lang="en" dir="ltr">KINGDOM ENCYCLOPEDIA</span></span>;
}

export function LoginIntro({ i18n }: Pick<ServerProps, 'i18n'>) {
  const locale = loginLanguage(i18n.language);
  const copy = loginCopy[locale];
  return (
    <header className="cms-login-intro" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <div className="cms-login-topline"><p className="cms-login-eyebrow">{copy.eyebrow}</p><LoginLanguageSwitch /></div>
      <h1>{copy.title}</h1>
      <p className="cms-login-description">{copy.description}</p>
    </header>
  );
}

export function LoginFooter({ i18n }: Pick<ServerProps, 'i18n'>) {
  const locale = loginLanguage(i18n.language);
  const copy = loginCopy[locale];
  return (
    <footer className="cms-login-footer" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <p>{copy.help}</p>
      <Link href={`/${locale}`}>{copy.back}</Link>
    </footer>
  );
}