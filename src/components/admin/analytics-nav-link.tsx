import Link from 'next/link';
import type { ServerProps } from 'payload';
import { hasRole, roles } from '../../collections/access';
import { loginLanguage } from './login-copy';

/** Registered as admin.components.afterNavLinks. Hidden entirely for non-staff. */
export function AnalyticsNavLink({ i18n, user }: Pick<ServerProps, 'i18n' | 'user'>) {
  if (!user || !hasRole({ user }, roles)) return null;
  const locale = loginLanguage(i18n.language);
  return (
    <Link className="cms-analytics-nav-link" href="/admin/analytics">
      {locale === 'ar' ? 'الإحصاءات' : 'Analytics'}
    </Link>
  );
}
