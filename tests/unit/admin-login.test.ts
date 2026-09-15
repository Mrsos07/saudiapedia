import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { loginCopy, loginLanguage } from '../../src/components/admin/login-copy';

test('login copy has complete Arabic and English variants with safe language fallback', () => {
  assert.deepEqual(Object.keys(loginCopy.ar), Object.keys(loginCopy.en));
  for (const locale of ['ar', 'en'] as const) {
    for (const text of Object.values(loginCopy[locale])) assert.ok(text.trim().length > 0);
  }
  assert.equal(loginLanguage('ar'), 'ar');
  assert.equal(loginLanguage('en'), 'en');
  assert.equal(loginLanguage(undefined), 'ar');
  assert.equal(loginLanguage('fr'), 'ar');
});

test('custom login is registered around Payload authentication, not a replacement form', async () => {
  const config = await readFile('src/payload.config.ts', 'utf8');
  const map = await readFile('src/app/(payload)/admin/importMap.ts', 'utf8');
  const intro = await readFile('src/components/admin/login-intro.tsx', 'utf8');
  const setup = await readFile('src/app/(payload)/setup.tsx', 'utf8');
  for (const name of ['LoginIntro', 'LoginFooter', 'LoginLogo']) {
    const reference = `/components/admin/login-intro#${name}`;
    assert.ok(config.includes(reference));
    assert.ok(map.includes(reference));
  }
  assert.doesNotMatch(intro + setup, /<form|<input|localStorage|payload\.config/);
  assert.match(intro, /i18n\.language/);
  assert.match(setup, /\['ar', 'en'\]/);
});