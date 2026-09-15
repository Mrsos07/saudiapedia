'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { analyticsOptOut, isTrackableAnalyticsPath } from '../lib/analytics';

/** No props, identifiers, storage, cookies, referrer, query strings or paths sent.
 * Mount once on each successfully resolved public page (published articles only),
 * not on search, previews, errors, or a shared layout containing those pages. */
export function PageViewTracker() {
  const pathname = usePathname();
  const visit = useRef<{ pathname: string | null; sent: boolean }>({ pathname: null, sent: false });

  useEffect(() => {
    if (visit.current.pathname !== pathname) visit.current = { pathname, sent: false };
    if (!isTrackableAnalyticsPath(pathname)) return;

    const recordWhenVisible = () => {
      const privacy = navigator as Navigator & { globalPrivacyControl?: boolean };
      if (visit.current.sent || document.visibilityState !== 'visible'
        || analyticsOptOut(navigator.doNotTrack, privacy.globalPrivacyControl)) return;
      // Survives React Strict Mode's effect replay. A real remount is a new view.
      visit.current.sent = true;
      try {
        void fetch('/api/analytics/page-view', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
          credentials: 'omit',
          mode: 'same-origin',
          referrerPolicy: 'no-referrer',
          cache: 'no-store',
          redirect: 'error',
          keepalive: true,
        }).catch(() => undefined);
      } catch {
        // Unsupported fetch/options must never break the page. No retries.
      }
    };

    recordWhenVisible();
    document.addEventListener('visibilitychange', recordWhenVisible);
    return () => document.removeEventListener('visibilitychange', recordWhenVisible);
  }, [pathname]);

  return null;
}