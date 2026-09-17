import assert from 'node:assert/strict';
import test from 'node:test';
import {
  entries, entryPath, isLocale, localize, normalizeSearch, searchEntries, matchesSection,
  resolveSectionLabel, seedSectionLabels, saudiStateHistory, administrativeRegions,
  type Entry, type Localized,
} from '../../src/lib/encyclopedia';
import { validHTTPURL } from '../../src/collections/access';
import { navigation } from '../../src/lib/site';
import regionBatch from '../../docs/editorial-batches/regions-20260917.json' with { type: 'json' };
import discoveryBatch from '../../docs/editorial-batches/discovery-20260916.json' with { type: 'json' };
import { decodePublicArticle, matchingPublicPair } from '../../src/collections/public-articles';

test('leaders and biographies share one navigation entry and localized section label', () => {
  const people = navigation.filter(item => item.path === 'notable-figures');
  assert.equal(people.length, 1);
  assert.deepEqual(people[0], { path: 'notable-figures', ar: 'شخصيات بارزة', en: 'Notable figures' });
  assert.equal(navigation.some(item => ['people', 'rulers'].includes(item.path)), false);
  for (const locale of ['ar', 'en'] as const) {
    assert.equal(seedSectionLabels.people[locale], people[0][locale]);
    assert.equal(resolveSectionLabel('people', locale, { ar: 'الشخصيات', en: 'People' }), people[0][locale]);
    assert.equal(resolveSectionLabel('custom-section', locale, { ar: 'قسم مخصص', en: 'Custom section' }), locale === 'ar' ? 'قسم مخصص' : 'Custom section');
  }
});

test('merged people listing includes every biography and ruler without altering article routes', () => {
  const people = entries.filter(entry => matchesSection(entry, 'people'));
  assert.equal(people.length, 9);
  assert.equal(people.filter(entry => entry.kind === 'ruler').length, 7);
  assert.equal(people.filter(entry => entry.kind === 'notable').length, 2);
  const ruler: Entry = { ...people[0], section: 'custom-section', kind: 'ruler' };
  assert.equal(matchesSection(ruler, 'people'), true);
  assert.equal(matchesSection(ruler, 'custom-section'), true);
  assert.equal(entryPath(ruler, 'ar'), `/ar/custom-section/${ruler.slug}`);
  assert.equal(matchesSection({ ...ruler, kind: undefined }, 'people'), false);
  assert.equal(matchesSection({ ...ruler, section: 'people', kind: undefined }, 'people'), true);
  assert.deepEqual(entries.filter(entry => matchesSection(entry, 'notable-figures')), people);
  assert.equal(matchesSection(ruler, 'notable-figures'), true);
  assert.equal(matchesSection({ ...ruler, kind: 'notable' }, 'notable-figures'), true);
  assert.equal(matchesSection({ ...ruler, section: 'notable-figures', kind: undefined }, 'notable-figures'), true);
  assert.equal(matchesSection({ ...ruler, kind: undefined }, 'notable-figures'), false);
  assert.deepEqual(entries.filter(entry => matchesSection(entry, 'history')), entries.filter(entry => entry.section === 'history'));
});

test('home history selects the first, second and third Saudi states regardless of content order', () => {
  const states = entries.filter(entry => entry.section === 'history');
  const otherHistory = { ...states[0], slug: 'another-history-topic' };
  const wrongSection = { ...states[0], section: 'heritage' };
  const input = [otherHistory, wrongSection, ...states.toReversed()];
  const before = structuredClone(input);
  const selected = saudiStateHistory(input);
  assert.deepEqual(selected.map(entry => entry.slug), ['first-saudi-state', 'second-saudi-state', 'third-saudi-state']);
  assert.equal(selected[0], states[0]);
  assert.deepEqual(input, before);
});

test('home history never substitutes unrelated articles or seed data for unavailable states', () => {
  const states = entries.filter(entry => entry.section === 'history');
  assert.deepEqual(saudiStateHistory([]), []);
  assert.deepEqual(saudiStateHistory([{ ...states[0], section: 'heritage' }]), []);
  assert.deepEqual(saudiStateHistory([{ ...states[0], slug: 'another-history-topic' }]), []);
  assert.deepEqual(saudiStateHistory([states[2], states[0]]), [states[0], states[2]]);
});

test('administrative region links contain only the thirteen regions, not governorates or seed substitutions', () => {
  const regions = entries.filter(entry => entry.section === 'regions');
  const alula = { ...regions[0], slug: 'alula-geography' };
  const wrongSection = { ...regions[0], section: 'history' };
  const input = [alula, wrongSection, ...regions.toReversed()];
  const before = structuredClone(input);
  assert.deepEqual(administrativeRegions(input), regions);
  assert.deepEqual(administrativeRegions([]), []);
  assert.deepEqual(administrativeRegions([alula, wrongSection]), []);
  assert.deepEqual(administrativeRegions([regions[5], regions[0]]), [regions[0], regions[5]]);
  assert.deepEqual(input, before);
});

test('regional batch covers all thirteen administrative seats with unique bilingual SEO and aligned citations', () => {
  const expected = ['riyadh', 'makkah', 'madinah', 'qassim', 'eastern-province', 'asir', 'tabuk', 'hail', 'northern-borders', 'jazan', 'najran', 'bahah', 'jawf'];
  assert.deepEqual(regionBatch.topics.map(topic => topic.slug), expected);
  assert.deepEqual(regionBatch.topics.map(topic => topic.ar.facts[0].value), ['مدينة الرياض', 'مدينة مكة المكرمة', 'المدينة المنورة', 'بريدة', 'الدمام', 'أبها', 'مدينة تبوك', 'مدينة حائل', 'عرعر', 'مدينة جازان', 'مدينة نجران', 'مدينة الباحة', 'سكاكا']);
  assert.deepEqual(regionBatch.updateExisting, ['riyadh', 'asir']);
  assert.equal(new Set(regionBatch.topics.map(topic => topic.translationKey)).size, 13);
  for (const locale of ['ar', 'en'] as const) {
    assert.equal(new Set(regionBatch.topics.map(topic => topic[locale].seoTitle)).size, 13);
    assert.equal(new Set(regionBatch.topics.map(topic => topic[locale].seoDescription)).size, 13);
  }
  for (const topic of regionBatch.topics) {
    const pair = (['ar', 'en'] as const).map((locale, index) => {
      const text = topic[locale];
      assert.ok(text.seoTitle.length <= 60, topic.slug + ' title');
      assert.ok(text.seoDescription.length >= 90 && text.seoDescription.length <= 160, topic.slug + ' description');
      assert.equal(text.body.length, 4);
      assert.equal(text.facts.length, 4);
      assert.ok(text.body.map(part => part.text).join(' ').split(/\s+/).length >= 140, topic.slug);
      for (const part of text.body) {
        const citation = /\[([1-9]\d*(?:[،,]\s*[1-9]\d*)*)\]$/.exec(part.text);
        assert.ok(citation, topic.slug);
        assert.ok(citation[1].split(/[،,]\s*/).map(Number).every(number => number <= text.sources.length));
      }
      return decodePublicArticle({ ...text, id: index + 1, locale, section: topic.section, slug: topic.slug,
        translationKey: topic.translationKey, kind: null, image: 1, reviewStatus: 'approved', _status: 'published', noIndex: false });
    });
    assert.equal(matchingPublicPair(pair[0], pair[1]), true);
    assert.equal('reviewNotes' in pair[0], false);
  }
});

test('all seven kings have expanded bilingual biographies, traceable sources and individual photographs', () => {
  const kings = entries.filter(entry => entry.kind === 'ruler');
  assert.equal(kings.length, 7);
  for (const entry of kings) {
    assert.ok(entry.body.length >= 5, entry.slug);
    assert.ok(entry.facts.length >= 5, entry.slug);
    assert.equal(entry.image, `/images/kings/${entry.slug}.webp`);
    assert.ok(entry.imageCredit?.attribution?.includes('https://commons.wikimedia.org/wiki/File:'));
    assert.ok(entry.imageCredit?.license?.includes('Public domain'));
    assert.equal(entry.sources.length, 2);
    assert.equal(new URL(entry.sources[0].url).hostname, 'saudipedia.com');
    assert.equal(new URL(entry.sources[1].url).hostname, 'en.wikipedia.org');
    for (const locale of ['ar', 'en'] as const) {
      assert.ok(entry.body.every(part => /\[1(?:[،,] 2)?\]/.test(part.text[locale])));
      assert.equal(entry.seo?.[locale]?.noIndex, true);
    }
    assert.equal(entry.status, 'editorial-preview');
    assert.equal('reviewNotes' in entry, false);
  }
});

test('discovery batch has six structurally publishable bilingual topics in three CMS-managed sections', () => {
  assert.equal(discoveryBatch.topics.length, 6);
  assert.deepEqual(discoveryBatch.sections.map(section => section.slug), ['economy', 'nature', 'tourism']);
  assert.equal(new Set(discoveryBatch.topics.map(topic => topic.translationKey)).size, 6);
  for (const section of discoveryBatch.sections) assert.equal(discoveryBatch.topics.filter(topic => topic.section === section.slug).length, 2);
  for (const topic of discoveryBatch.topics) {
    assert.equal(topic.image.type, 'illustration');
    const pair = (['ar', 'en'] as const).map((locale, index) => {
      const text = topic[locale];
      assert.ok(text.seoTitle.length <= 70 && text.seoDescription.length <= 160, topic.slug);
      assert.ok(text.body.length >= 4 && text.facts.length >= 4);
      assert.ok(text.body.map(row => row.text).join(' ').split(/\s+/).length >= 160);
      for (const row of text.body) {
        const citation = /\[([1-9]\d*(?:[،,]\s*[1-9]\d*)*)\]$/.exec(row.text);
        assert.ok(citation, topic.slug);
        assert.ok(citation[1].split(/[،,]\s*/).map(Number).every(number => number <= text.sources.length));
      }
      assert.ok(text.sources.some(source => new URL(source.url).hostname === 'saudipedia.com'));
      assert.ok(text.sources.some(source => new URL(source.url).hostname !== 'saudipedia.com'));
      return decodePublicArticle({ ...text, id: index + 1, locale, section: topic.section, slug: topic.slug,
        translationKey: topic.translationKey, period: topic.period ?? null, kind: null, image: 1,
        reviewStatus: 'approved', _status: 'published', noIndex: true });
    });
    assert.equal(matchingPublicPair(pair[0], pair[1]), true);
    assert.equal('reviewNotes' in pair[0], false);
    for (const section of ['', '../admin', 'UPPERCASE', 'two words', null]) {
      assert.throws(() => decodePublicArticle({ ...topic.ar, id: 1, locale: 'ar', slug: topic.slug,
        translationKey: topic.translationKey, section, reviewStatus: 'approved', _status: 'published' }));
    }
  }
});

test('seed contains 30 bilingual previews, 13 regions, 7 kings and 3 states', () => {
  assert.equal(entries.length, 30);
  assert.equal(entries.filter((entry) => entry.section === 'history').length, 3);
  assert.equal(entries.filter((entry) => entry.kind === 'ruler').length, 7);
  assert.equal(entries.filter((entry) => entry.kind === 'notable').length, 2);
  assert.equal(entries.filter((entry) => entry.section === 'heritage').length, 5);
  assert.deepEqual(entries.filter((entry) => entry.section === 'regions').map((entry) => entry.slug).sort(), [
    'asir', 'bahah', 'eastern-province', 'hail', 'jawf', 'jazan', 'madinah',
    'makkah', 'najran', 'northern-borders', 'qassim', 'riyadh', 'tabuk',
  ]);
  assert.deepEqual(entries.filter((entry) => entry.section === 'history').map((entry) => entry.slug).sort(), [
    'first-saudi-state', 'second-saudi-state', 'third-saudi-state',
  ]);
  assert.equal(entries.filter((entry) => entry.status === 'published').length, 0);
});

test('every preview has localized content, stable unique slugs and distinct language paths', () => {
  const paths = new Set<string>();
  const slugs = new Set<string>();
  const checkLocalized = (value: Localized) => {
    for (const locale of ['ar', 'en'] as const) assert.ok(value[locale].trim());
  };
  for (const entry of entries) {
    assert.equal(entry.status, 'editorial-preview');
    assert.match(entry.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(!slugs.has(entry.slug), entry.slug);
    slugs.add(entry.slug);
    for (const value of [entry.title, entry.summary, entry.category, entry.imageAlt]) checkLocalized(value);
    assert.ok(entry.facts.length > 0);
    assert.ok(entry.kind === 'ruler' ? entry.body.length >= 5 : entry.body.length === 2);
    for (const row of entry.facts) { checkLocalized(row.label); checkLocalized(row.value); }
    for (const row of entry.body) { checkLocalized(row.heading); checkLocalized(row.text); }
    for (const source of entry.sources) {
      checkLocalized(source.title);
      assert.equal(validHTTPURL(source.url), true, source.url);
    }
    for (const locale of ['ar', 'en'] as const) {
      const url = entryPath(entry, locale);
      assert.equal(url, `/${locale}/${entry.section}/${entry.slug}`);
      assert.ok(!paths.has(url));
      paths.add(url);
    }
  }
  assert.equal(paths.size, 60);
  assert.equal(entries.filter((entry) => entry.sources.length === 0).length, 18);
});

test('locale helpers do not silently accept unsupported languages', () => {
  assert.equal(isLocale('ar'), true);
  assert.equal(isLocale('en'), true);
  for (const locale of ['AR', 'en-US', 'fr', '']) assert.equal(isLocale(locale), false);
  assert.equal(localize({ ar: 'عربي', en: 'English' }, 'en'), 'English');
});

test('search normalization folds marks, tatweel, alef, digits, accents and punctuation', () => {
  assert.equal(normalizeSearch('  إِمَـام أَحْمَد، آل سعود!  '), 'امام احمد ال سعود');
  assert.equal(normalizeSearch('على ١٩٣٢ / ۱۹۳۲'), 'علي 1932 1932');
  assert.equal(normalizeSearch('  CAFÉ—Riyadh\nSTATE  '), 'cafe riyadh state');
  assert.equal(normalizeSearch('َـ!!!'), '');
  const folded = normalizeSearch('إِمَـام ١٩٣٢');
  assert.equal(normalizeSearch(folded), folded);
});

test('seed search matches normalized tokens and periods without mutating input', () => {
  const before = structuredClone(entries);
  assert.deepEqual(searchEntries(entries, 'الأُولَى السُّعُودِيَّة', 'ar').map((entry) => entry.slug), ['first-saudi-state', 'at-turaif']);
  // Hegra's summary mentions Saudi Arabia's first World Heritage inscription.
  assert.deepEqual(searchEntries(entries, 'FIRST saudi', 'en').map((entry) => entry.slug), ['first-saudi-state', 'king-abdulaziz', 'king-saud', 'at-turaif', 'hegra']);
  assert.ok(searchEntries(entries, '١٩٣٢', 'ar').some((entry) => entry.slug === 'third-saudi-state'));
  assert.deepEqual(searchEntries(entries, 'nonexistentword', 'en'), []);
  for (const query of ['', '  ', 'َـ!!!']) {
    const result = searchEntries(entries, query, 'ar');
    assert.deepEqual(result, entries);
    assert.notEqual(result, entries);
  }
  assert.deepEqual(entries, before);
});

test('search uses only selected-language title/category/summary and shared period; caller filters publication', () => {
  const item: Entry = {
    ...entries[0], title: { ar: 'عربي', en: 'Alpha' },
    summary: { ar: 'ملخص', en: 'Beta' }, category: { ar: 'قسم', en: 'Gamma' },
    period: undefined, body: [{ heading: { ar: 'عنوان', en: 'Hidden' }, text: { ar: 'نص', en: 'Secret' } }],
    facts: [{ label: { ar: 'حقيقة', en: 'Factonly' }, value: { ar: 'قيمة', en: 'Valueonly' } }],
    sources: [{ title: { ar: 'مصدر', en: 'Sourceonly' }, url: 'https://example.org/reference' }],
  };
  assert.deepEqual(searchEntries([item], 'beta alpha', 'en'), [item]);
  for (const query of ['Hidden', 'Secret', 'Factonly', 'Sourceonly', 'عربي', 'alpha missing']) {
    assert.deepEqual(searchEntries([item], query, 'en'), []);
  }
  assert.deepEqual(searchEntries([item], 'عربي', 'ar'), [item]);
  const second = { ...item, slug: 'second' };
  assert.deepEqual(searchEntries([second, item], 'alpha', 'en'), [second, item]);
  assert.equal(searchEntries([item], 'alpha', 'en')[0].status, 'editorial-preview');
});