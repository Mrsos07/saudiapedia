'use client';

import { useState } from 'react';
import { useTranslation } from '@payloadcms/ui';

export function LoginLanguageSwitch() {
  const { i18n, switchLanguage } = useTranslation();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const next = i18n.language === 'ar' ? 'en' : 'ar';
  return (
    <div className="cms-login-language">
      <button type="button" className="cms-language-button" lang={next}
        disabled={pending || !switchLanguage}
        onClick={async () => {
          setPending(true);
          setFailed(false);
          try { await switchLanguage?.(next); }
          catch { setFailed(true); }
          finally { setPending(false); }
        }}>
        {next === 'ar' ? 'العربية' : 'English'}
      </button>
      {failed && <p role="alert">{i18n.language === 'ar' ? 'تعذر تغيير اللغة. حاول مجددًا.' : 'Could not change language. Try again.'}</p>}
    </div>
  );
}