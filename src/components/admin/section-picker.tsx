'use client';

import { useField, useTranslation } from '@payloadcms/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { loginLanguage } from './login-copy';

type SectionOption = { slug: string; nameAr: string; nameEn: string };
type FetchState = { status: 'loading' | 'ready' | 'error'; options: SectionOption[] };

const copy = {
  ar: {
    label: 'القسم', loading: 'تحميل الأقسام…', error: 'تعذّر تحميل قائمة الأقسام. أعد المحاولة لاحقًا.',
    empty: 'اختر قسمًا', manage: 'إدارة الأقسام',
  },
  en: {
    label: 'Section', loading: 'Loading sections…', error: 'Could not load sections. Try again later.',
    empty: 'Select a section', manage: 'Manage sections',
  },
} as const;

/** Reads/writes the plain `section` text field (stores the section's stable
 * slug), but presents it as a live dropdown backed by the `sections`
 * collection instead of a free-text input or a stale compiled-in enum. */
export function SectionPicker() {
  const { i18n } = useTranslation();
  const language = loginLanguage(i18n.language);
  const text = copy[language];
  const { value, setValue } = useField<string>({ path: 'section' });
  const [state, setState] = useState<FetchState>({ status: 'loading', options: [] });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/sections?limit=200&sort=order&depth=0', {
          credentials: 'same-origin', headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error('request failed');
        const body: unknown = await response.json();
        const docs = body && typeof body === 'object' && 'docs' in body && Array.isArray(body.docs) ? body.docs : [];
        const options: SectionOption[] = [];
        for (const doc of docs) {
          if (doc && typeof doc === 'object' && 'slug' in doc && 'nameAr' in doc && 'nameEn' in doc
            && typeof doc.slug === 'string' && typeof doc.nameAr === 'string' && typeof doc.nameEn === 'string') {
            options.push({ slug: doc.slug, nameAr: doc.nameAr, nameEn: doc.nameEn });
          }
        }
        if (!cancelled) setState({ status: 'ready', options });
      } catch {
        if (!cancelled) setState({ status: 'error', options: [] });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="field-type" lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <label className="field-label" htmlFor="field-section">{text.label}</label>
      {state.status === 'loading' && <p role="status">{text.loading}</p>}
      {state.status === 'error' && <p role="alert">{text.error}</p>}
      {state.status === 'ready' && (
        <select id="field-section" value={value ?? ''} onChange={(event) => setValue(event.target.value)}>
          <option value="" disabled>{text.empty}</option>
          {state.options.map((option) => (
            <option key={option.slug} value={option.slug}>
              {language === 'ar' ? option.nameAr : option.nameEn} · {option.slug}
            </option>
          ))}
        </select>
      )}
      <Link className="section-picker__manage" href="/admin/collections/sections">{text.manage}</Link>
    </div>
  );
}
