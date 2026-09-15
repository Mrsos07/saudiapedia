import assert from 'node:assert/strict';
import test from 'node:test';
import {
  articleSEOGuidance, authorSEOGuidance, hasSelectedImage, seoFieldString,
  seoGuidanceCopy, seoLanguage, seoText, unicodeLength, validSEOSlug,
} from '../../src/lib/seo-guidance';

test('unknown values are narrowed, never stringified; Unicode counts code points', () => {
  for (const value of [undefined, null, 123, false, [], {}, { toString: () => { throw new Error('Must not coerce'); } }]) {
    assert.equal(seoText(value), '');
    assert.equal(unicodeLength(value), 0);
  }
  assert.equal(seoFieldString(' slug '), ' slug ');
  assert.equal(seoText(' عنوان '), 'عنوان');
  assert.equal(unicodeLength(' 😀𐐀 '), 2);
  assert.equal(unicodeLength('السعودية'), 8);
  assert.equal(unicodeLength('ا\u0654'), 2); // Combining mark is a separate code point.
});

test('effective article preview uses nonblank overrides and independently falls back', () => {
  const input = Object.freeze({ title: 'Article', summary: 'Summary', seoTitle: ' Override ', seoDescription: ' ', slug: 'valid-slug' });
  assert.deepEqual(articleSEOGuidance(input).preview, { title: 'Override', description: 'Summary', slug: 'valid-slug' });
  assert.deepEqual(articleSEOGuidance({ ...input, seoTitle: {}, seoDescription: ' Description ' }).preview,
    { title: 'Article', description: 'Description', slug: 'valid-slug' });
  assert.deepEqual(articleSEOGuidance({}).preview, { title: '', description: '', slug: '' });
  assert.equal(input.seoTitle, ' Override ');
});

test('title length boundaries are inclusive and purely informational', () => {
  for (const count of [0, 29, 30, 65, 66]) {
    const check = articleSEOGuidance({ title: '😀'.repeat(count) }, 'en').checks[0];
    assert.equal(check.count, count);
    assert.equal(check.status, 'info');
    assert.equal(check.message, count === 0 ? seoGuidanceCopy.en.titleMissing
      : count >= 30 && count <= 65 ? seoGuidanceCopy.en.titleWithin : seoGuidanceCopy.en.titleOutside);
  }
});

test('description length boundaries are inclusive and purely informational', () => {
  for (const count of [0, 69, 70, 170, 171]) {
    const check = articleSEOGuidance({ summary: 'ع'.repeat(count) }, 'ar').checks[1];
    assert.equal(check.count, count);
    assert.equal(check.status, 'info');
    assert.equal(check.message, count === 0 ? seoGuidanceCopy.ar.descriptionMissing
      : count >= 70 && count <= 170 ? seoGuidanceCopy.ar.descriptionWithin : seoGuidanceCopy.ar.descriptionOutside);
  }
  assert.equal(articleSEOGuidance({ title: 'x', seoTitle: 'x'.repeat(30) }).checks[0].count, 30);
  assert.equal(articleSEOGuidance({ summary: 'x', seoDescription: 'x'.repeat(70) }).checks[1].count, 70);
});

test('required slug format matches article workflow without trimming invalid input', () => {
  for (const slug of ['a', '123', 'saudi-history-2']) {
    assert.equal(validSEOSlug(slug), true);
    assert.equal(articleSEOGuidance({ slug }).checks[2].status, 'ready');
  }
  for (const slug of [undefined, null, 1, {}, '', ' ', ' padded ', 'UPPER', 'a--b', '-a', 'a-', 'a/b', 'a_b', 'عربي', 'a\n', 'https://example.org']) {
    assert.equal(validSEOSlug(slug), false);
    assert.equal(articleSEOGuidance({ slug }).checks[2].status, 'error');
  }
});

test('image alt is optional without an image, warns only when a selected image lacks alt', () => {
  for (const image of [0, 12, 'media-id', { id: 12 }, { id: 'media-id' }]) {
    assert.equal(hasSelectedImage(image), true);
    assert.equal(articleSEOGuidance({ image, imageAlt: ' ' }).checks[3].status, 'warning');
    assert.equal(articleSEOGuidance({ image, imageAlt: 'Verified image description' }).checks[3].status, 'ready');
  }
  for (const image of [undefined, null, false, true, '', ' ', {}, [], { id: {} }, NaN, Infinity]) {
    assert.equal(hasSelectedImage(image), false);
    assert.equal(articleSEOGuidance({ image }).checks[3].status, 'optional');
  }
});

test('authors require both names and advise on optional biographies without inventing metadata', () => {
  const empty = authorSEOGuidance({});
  assert.deepEqual(empty.checks.map(({ status }) => status), ['error', 'error', 'warning', 'warning']);
  const partial = authorSEOGuidance({ nameAr: 'اسم', bioEn: 'Verified biography' });
  assert.deepEqual(partial.checks.map(({ status }) => status), ['ready', 'error', 'warning', 'ready']);
  const complete = authorSEOGuidance(Object.freeze({ nameAr: ' اسم ', nameEn: ' Name ', bioAr: 'نبذة', bioEn: 'Biography' }));
  assert.ok(complete.checks.every(({ status }) => status === 'ready'));
  assert.deepEqual(complete.preview, { nameAr: 'اسم', nameEn: 'Name', bioAr: 'نبذة', bioEn: 'Biography' });
  assert.deepEqual(Object.keys(complete), ['preview', 'checks']);
  assert.equal('url' in complete.preview, false);
  assert.equal('seoTitle' in complete.preview, false);
  assert.equal('score' in complete, false);
  assert.equal('score' in articleSEOGuidance({}), false);
});

test('previews preserve supplied strings as text, never parse markup or generate facts', () => {
  const text = '<img src=x onerror=alert(1)> & <script>bad()</script>';
  assert.equal(articleSEOGuidance({ title: text, summary: text }).preview.title, text);
  assert.equal(authorSEOGuidance({ nameEn: text, bioEn: text }).preview.bioEn, text);
  assert.deepEqual(authorSEOGuidance({ nameAr: {}, bioEn: false }).preview,
    { nameAr: '', nameEn: '', bioAr: '', bioEn: '' });
});

test('Arabic and English copy has equivalent complete keys and localizes every check', () => {
  assert.deepEqual(Object.keys(seoGuidanceCopy.ar).sort(), Object.keys(seoGuidanceCopy.en).sort());
  assert.deepEqual(Object.keys(seoGuidanceCopy.ar.statuses), Object.keys(seoGuidanceCopy.en.statuses));
  for (const language of ['ar', 'en'] as const) {
    for (const value of Object.values(seoGuidanceCopy[language])) {
      for (const text of typeof value === 'string' ? [value] : Object.values(value)) assert.ok(text.trim());
    }
    const messages = Object.values(seoGuidanceCopy[language]);
    for (const check of [...articleSEOGuidance({}, language).checks, ...authorSEOGuidance({}, language).checks]) {
      assert.ok(messages.includes(check.message));
    }
  }
  assert.equal(seoLanguage('en'), 'en');
  for (const language of ['ar', 'fr', undefined, {}, 1]) assert.equal(seoLanguage(language), 'ar');
});