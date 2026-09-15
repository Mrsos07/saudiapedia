'use client';
import { useState } from 'react';
import type { Locale } from '@/lib/encyclopedia';

export function ArticleTools({ title, locale }: { title: string; locale: Locale }) {
  const [status, setStatus] = useState('');
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${title} — ${locale === 'ar' ? 'موسوعة المملكة' : 'Kingdom Encyclopedia'}. ${window.location.href}`);
      setStatus(locale === 'ar' ? 'نُسخ الاستشهاد' : 'Citation copied');
    } catch { setStatus(locale === 'ar' ? 'تعذّر النسخ؛ يمكنك نسخ رابط الصفحة من المتصفح.' : 'Copy failed. You can copy the page address from your browser.'); }
  }
  return <div className="article-tools"><button onClick={copy}>{locale === 'ar' ? 'نسخ الاستشهاد' : 'Copy citation'}</button><button onClick={() => window.print()}>{locale === 'ar' ? 'طباعة المقال' : 'Print article'}</button><span role="status">{status}</span></div>;
}