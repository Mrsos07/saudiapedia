import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PhotoCredit } from '../../src/components/encyclopedia';
import { decodePublicArticle } from '../../src/collections/public-articles';
import { mergePair } from '../../src/lib/cms';
import type { ImageCredit, Locale } from '../../src/lib/encyclopedia';
import { imageCreditParts } from '../../src/lib/image-credit';
import { photoCredits } from '../../src/lib/site';

const image = '/api/media/file/approved.webp';
const source = 'https://commons.wikimedia.org/wiki/File:Diriyah_(Saudi_Arabia).jpg';
const license = 'https://creativecommons.org/licenses/by-sa/4.0/';

function render(credit: ImageCredit | undefined, locale: Locale = 'en', path = image) {
  return renderToStaticMarkup(createElement(PhotoCredit, { image: path, locale, credit }));
}

test('CMS credits use a closed native disclosure with full attribution available in both languages', () => {
  for (const locale of ['ar', 'en'] as const) {
    const text = `Photographer — ${source}. Converted to WebP; resized; display may crop.`;
    const html = render({ attribution: text, license: `CC BY-SA 4.0 ${license}` }, locale);
    assert.match(html, /<details class="photo-credit photo-credit-disclosure"/);
    assert.ok(html.includes(`dir="${locale === 'ar' ? 'rtl' : 'ltr'}"`));
    assert.ok(html.includes(`<summary>${locale === 'ar' ? 'حقوق الصورة' : 'Image credits'}</summary>`));
    assert.doesNotMatch(html, /<details[^>]*\sopen(?:[\s=>])/);
    assert.match(html, /class="photo-credit-content"/);
    assert.match(html, /Converted to WebP; resized; display may crop\./);
    assert.ok(html.includes(`href="${source}"`));
    assert.ok(html.includes(`href="${license}"`));
  }
});

test('source and CC license render as actual anchors with locale labels and bidi isolation', () => {
  for (const locale of ['ar', 'en'] as const) {
    const html = render({ attribution: `مصور / Photographer (${source}).`, license: `CC BY-SA 4.0: ${license}` }, locale);
    assert.ok(html.includes(`<a href="${source}" dir="ltr">${source}</a>).`));
    assert.ok(html.includes(`<a href="${license}" dir="ltr">${license}</a>`));
    assert.ok(html.includes(locale === 'ar' ? 'نسبة الصورة: ' : 'Image attribution: '));
    assert.ok(html.includes(locale === 'ar' ? 'الترخيص: ' : 'License: '));
    assert.equal((html.match(/<bdi>/g) ?? []).length, 2);
    assert.match(html, /مصور \/ Photographer/);
    assert.match(html, / · /);
  }
});

test('parentheses in Commons filenames survive while prose punctuation stays outside anchors', () => {
  const urls = [source, 'https://commons.wikimedia.org/wiki/File:Place_(outer_(inner))',
    'https://commons.wikimedia.org/wiki/File:Place%20%28Saudi%20Arabia%29.jpg',
    'http://example.org/photo', 'HTTPS://example.org/photo'];
  for (const url of urls) {
    for (const [before, after] of [['(', ').'], ['[', '].'], ['', '،'], ['', '؛'], ['', '؟'], ['', '…'], ['', '!?'], ['“', '”.']] as const) {
      const text = `${before}${url}${after}`;
      const parts = imageCreditParts(text);
      assert.deepEqual(parts.filter(part => part.href).map(part => part.href), [url], text);
      assert.equal(parts.map(part => part.text).join(''), text);
      assert.ok(render({ attribution: text }).includes(`<a href="${url}" dir="ltr">${url}</a>${after}`), text);
    }
  }
});

test('HTML, Markdown and attribute injection stay escaped while a genuine URL remains clickable', () => {
  const text = `<script>alert(1)</script><img src=x onerror=alert(1)> [bad](javascript:alert(1)) " onclick="alert(1) ${source}`;
  for (const locale of ['ar', 'en'] as const) {
    const html = render({ attribution: text, license: 'https://example.org/?a=1&b=%22test%22' }, locale);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(html, /&quot; onclick=&quot;/);
    assert.doesNotMatch(html, /<script|<img|<a[^>]*\sonclick=/);
    assert.match(html, /\[bad\]\(javascript:alert\(1\)\)/);
    assert.ok(html.includes(`<a href="${source}" dir="ltr">${source}</a>`));
    assert.match(html, /href="https:\/\/example.org\/\?a=1&amp;b=%22test%22"/);
  }
});

test('unsafe protocols, credentials, malformed URLs and control-split URLs never become links', () => {
  const unsafe = [
    'javascript:alert(1)', 'JAVASCRIPT:https://example.org', '[bad](javascript:alert(1))',
    'data:text/html,https://example.org', 'vbscript:msgbox(1)', 'ftp://example.org', '//example.org',
    'prefixhttps://example.org', 'https://user:secret@example.org', 'https://user@example.org',
    'https://@example.org', 'https://user%3Asecret@example.org', 'https://example.org\\@evil.example',
    'https:///example.org', 'https://[', 'https://', 'https://example.org/%ZZ',
    'https://exa\nmple.org', 'https://example.org/\tpath', 'https://example.org/\rpath',
    'https://example.org/\u0000path', 'https://example.org/\u007fpath', 'https://example.org/\u0085path',
    'https://example.org/\u202Epath', 'https://example.org/\u2066path',
    'https://example.org/%0Apath', 'https://example.org/%0dpath', 'https://example.org/%00',
    'https://example.org/%7f', 'https://example.org/%C2%85', 'https://example.org/%E2%80%AE',
    'https://example.org/%5cpath',
  ];
  for (const text of unsafe) {
    assert.deepEqual(imageCreditParts(text), [{ text }], JSON.stringify(text));
    for (const locale of ['ar', 'en'] as const) {
      assert.doesNotMatch(render({ attribution: text, license: text }, locale), /<a\b|href=/, JSON.stringify(text));
    }
  }
});

test('multiple URLs preserve all intervening text and skip unsafe candidates', () => {
  const text = `Source ${source}. Bad https://user:secret@example.org; License ${license}.`;
  const parts = imageCreditParts(text);
  assert.equal(parts.map(part => part.text).join(''), text);
  assert.deepEqual(parts.filter(part => part.href).map(part => part.href), [source, license]);
  const html = render({ attribution: text });
  assert.equal((html.match(/<a /g) ?? []).length, 2);
  assert.match(html, /Bad https:\/\/user:secret@example.org; License/);
});

test('absent and partial credits retain existing labels and separators', () => {
  for (const locale of ['ar', 'en'] as const) {
    assert.equal(render(undefined, locale), '');
    assert.equal(render({}, locale), '');
    const attributionOnly = render({ attribution: source }, locale);
    const licenseOnly = render({ license }, locale);
    assert.doesNotMatch(attributionOnly, /License:|الترخيص:| · /);
    assert.doesNotMatch(licenseOnly, /Image attribution:|نسبة الصورة:| · /);
    assert.match(attributionOnly, /<a href=/);
    assert.match(licenseOnly, /<a href=/);
  }
});

test('static credits and localized credits-page links are unchanged, never replaced by CMS text', () => {
  for (const locale of ['ar', 'en'] as const) {
    for (const credit of photoCredits) {
      const path = `/images/${credit.file}`;
      const html = render(undefined, locale, path);
      assert.equal(render({ attribution: 'PRIVATE CREDIT', license: source }, locale, path), html);
      assert.ok(html.includes(`href="/${locale}/credits"`));
      assert.ok(html.includes(credit.author));
    }
    assert.equal(render({ attribution: 'PRIVATE CREDIT' }, locale, 'https://storage.example/private.jpg'), '');
  }
});

test('private or unusable CMS media never contributes public linked credits (database-free)', () => {
  const media = { id: 7, published: true, url: image, attribution: `PRIVATE CREDIT ${source}`, license };
  const document = (locale: Locale, value: unknown, imageAlt: string | null) => decodePublicArticle({
    id: locale === 'ar' ? 1 : 2, locale, translationKey: 'credit-test', section: 'people', slug: 'credit-test',
    title: 'Title', summary: 'Summary', category: 'Category', _status: 'published', reviewStatus: 'approved',
    image: value, imageAlt, body: [{ heading: 'Heading', text: 'Text' }], sources: [{ title: 'Source', url: source }],
  });
  for (const [value, alt] of [
    [{ ...media, published: false }, 'Photo'], [{ ...media, published: undefined }, 'Photo'],
    [7, 'Photo'], [null, 'Photo'], [{ ...media, url: 'https://storage.example/private.jpg' }, 'Photo'],
    [{ ...media, url: `${image}?token=secret` }, 'Photo'], [media, null],
  ] as const) {
    const entry = mergePair(document('ar', value, alt), document('en', value, alt));
    assert.ok(entry);
    assert.equal(entry.imageCredit, undefined);
    for (const locale of ['ar', 'en'] as const) {
      const html = render(entry.imageCredit, locale, entry.image);
      assert.doesNotMatch(html, /PRIVATE CREDIT|commons.wikimedia.org|creativecommons.org/);
      assert.ok(html.includes(`href="/${locale}/credits"`));
    }
  }
});