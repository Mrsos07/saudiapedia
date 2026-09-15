'use client';

import { useFormFields, useTranslation } from '@payloadcms/ui';
import { useId, type CSSProperties, type ReactNode } from 'react';
import {
  articleSEOGuidance, authorSEOGuidance, hasSelectedImage, seoFieldString,
  seoGuidanceCopy, seoLanguage, type GuidanceCheck, type SEOLanguage,
} from '../../lib/seo-guidance';

// Each selector returns a primitive, not a newly allocated object or the entire
// form state. Payload's context selector subscribes only to the relevant value.
function useTextField(path: string): string {
  return useFormFields(([fields]) => seoFieldString(fields[path]?.value));
}

const panelStyle: CSSProperties = {
  marginBlock: '24px', padding: 'clamp(16px, 3vw, 28px)', borderRadius: 16,
  border: '1px solid var(--theme-elevation-200, #d8e1d8)',
  borderBlockStart: '4px solid #678872', background: 'var(--theme-elevation-50, #f6f4ee)',
  color: 'var(--theme-text, #183b30)', fontFamily: 'var(--font-body, Zain, sans-serif)',
  textAlign: 'start', lineHeight: 1.65, overflowWrap: 'anywhere', minWidth: 0,
};
const cardStyle: CSSProperties = {
  border: '1px solid var(--theme-elevation-200, #d8e1d8)', borderRadius: 12,
  padding: 16, background: 'var(--theme-elevation-0, #fffefa)', minWidth: 0,
};
const gridStyle: CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 12,
};

function GuidancePanel({ language, heading, note, children }: {
  language: SEOLanguage; heading: string; note: string; children: ReactNode;
}) {
  const id = useId();
  const copy = seoGuidanceCopy[language];
  return (
    <section lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'} aria-labelledby={id} style={panelStyle}>
      <p style={{ margin: 0, fontWeight: 700 }}>{copy.live}</p>
      <h2 id={id} style={{ marginBlock: '4px 12px', fontSize: 24 }}>{heading}</h2>
      <p>{note}</p>
      <p style={{ paddingInlineStart: 12, borderInlineStart: '3px solid #a58a52' }}>{copy.disclaimer}</p>
      {children}
    </section>
  );
}

function Checks({ checks, language }: { checks: GuidanceCheck[]; language: SEOLanguage }) {
  const copy = seoGuidanceCopy[language];
  const labels: Record<string, string> = {
    title: copy.title, description: copy.description, slug: copy.slug, imageAlt: copy.imageAlt,
    nameAr: copy.nameAr, nameEn: copy.nameEn, bioAr: copy.bioAr, bioEn: copy.bioEn,
  };
  return (
    <ul aria-live="polite" aria-relevant="text" style={{ ...gridStyle, padding: 0, listStyle: 'none', marginBlock: '16px 0' }}>
      {checks.map((check) => (
        <li key={check.field} style={cardStyle}>
          <strong>{labels[check.field]}</strong>
          <span style={{ display: 'block', fontWeight: 700 }}>{copy.statuses[check.status]}</span>
          {check.count !== undefined && <span><bdi>{check.count}</bdi> {copy.characters}</span>}
          <p style={{ marginBlock: '6px 0' }}>{check.message}</p>
        </li>
      ))}
    </ul>
  );
}

/** Register as a top-level nonpersisted Payload `ui` field in Articles. */
export function ArticleSEO() {
  const { i18n } = useTranslation();
  const language = seoLanguage(i18n.language);
  const copy = seoGuidanceCopy[language];
  const title = useTextField('title');
  const summary = useTextField('summary');
  const seoTitle = useTextField('seoTitle');
  const seoDescription = useTextField('seoDescription');
  const slug = useTextField('slug');
  const imageAlt = useTextField('imageAlt');
  const articleLanguage = seoLanguage(useTextField('locale'));
  const imageSelected = useFormFields(([fields]) => hasSelectedImage(fields.image?.value));
  const { preview, checks } = articleSEOGuidance({ title, summary, seoTitle, seoDescription, slug,
    imageAlt, image: imageSelected ? 'selected' : null }, language);

  return (
    <GuidancePanel language={language} heading={copy.articleHeading} note={copy.articleNote}>
      <div style={cardStyle}>
        <h3 style={{ marginBlock: '0 12px', fontSize: 18 }}>{copy.preview}</h3>
        <p style={{ margin: 0 }}>{copy.slug}: <bdi dir="ltr">{preview.slug || '—'}</bdi></p>
        <div lang={articleLanguage} dir={articleLanguage === 'ar' ? 'rtl' : 'ltr'}>
          <p style={{ fontSize: 23, fontWeight: 700, marginBlock: '8px' }}>
            {preview.title || <span lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'}>{copy.emptyTitle}</span>}
          </p>
          <p style={{ margin: 0 }}>{preview.description || <span lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'}>{copy.emptyDescription}</span>}</p>
        </div>
      </div>
      <Checks checks={checks} language={language} />
    </GuidancePanel>
  );
}

/** Private bilingual editorial guidance; deliberately no author URL/metadata. */
export function AuthorSEO() {
  const { i18n } = useTranslation();
  const language = seoLanguage(i18n.language);
  const copy = seoGuidanceCopy[language];
  const nameAr = useTextField('nameAr');
  const nameEn = useTextField('nameEn');
  const bioAr = useTextField('bioAr');
  const bioEn = useTextField('bioEn');
  const { preview, checks } = authorSEOGuidance({ nameAr, nameEn, bioAr, bioEn }, language);

  return (
    <GuidancePanel language={language} heading={copy.authorHeading} note={copy.authorNote}>
      <h3 style={{ fontSize: 18 }}>{copy.authorPreview}</h3>
      <div style={gridStyle}>
        {(['ar', 'en'] as const).map((locale) => (
          <div key={locale} style={cardStyle}>
            <strong>{locale === 'ar' ? copy.arabic : copy.english}</strong>
            <div lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
              <p style={{ fontSize: 23, fontWeight: 700, marginBlock: '8px' }}>
                {(locale === 'ar' ? preview.nameAr : preview.nameEn) || seoGuidanceCopy[locale].emptyName}
              </p>
              <p style={{ margin: 0 }}>{(locale === 'ar' ? preview.bioAr : preview.bioEn) || seoGuidanceCopy[locale].emptyBio}</p>
            </div>
          </div>
        ))}
      </div>
      <Checks checks={checks} language={language} />
    </GuidancePanel>
  );
}