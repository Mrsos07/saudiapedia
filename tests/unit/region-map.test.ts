import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RegionExplorer } from '../../src/components/encyclopedia';
import { administrativeRegions, entries, type Entry, type Locale } from '../../src/lib/encyclopedia';
import { CENSUS_2022, REGION_FACTS, regionStatistics } from '../../src/lib/region-facts';
import { REGION_MAP_VIEWBOX, REGION_SHAPES } from '../../src/lib/region-map';

const slugs = administrativeRegions(entries).map(entry => entry.slug);

test('the generated map has exactly the thirteen administrative regions with valid paths and anchors', () => {
  assert.equal(slugs.length, 13);
  assert.deepEqual(REGION_SHAPES.map(shape => shape.slug).sort(), [...slugs].sort());
  assert.equal(new Set(REGION_SHAPES.map(shape => shape.iso)).size, 13);
  const [, , width, height] = REGION_MAP_VIEWBOX.split(' ').map(Number);
  for (const shape of REGION_SHAPES) {
    assert.match(shape.path, /^(M[\d.]+ [\d.]+(L[\d.]+ [\d.]+)+Z)+$/, shape.slug);
    assert.ok(shape.anchor[0] > 0 && shape.anchor[0] < width && shape.anchor[1] > 0 && shape.anchor[1] < height, shape.slug);
  }
  assert.ok(REGION_SHAPES.reduce((size, shape) => size + shape.path.length, 0) < 20000, 'map stays lightweight');
});

test('census figures cover every region, sum to the national total and rank consistently', () => {
  assert.deepEqual(Object.keys(REGION_FACTS).sort(), [...slugs].sort());
  assert.equal(Object.values(REGION_FACTS).reduce((sum, fact) => sum + fact.population, 0), CENSUS_2022.total);
  assert.deepEqual(slugs.map(slug => regionStatistics(slug)!.rank).sort((a, b) => a - b), Array.from({ length: 13 }, (_, i) => i + 1));
  const riyadh = regionStatistics('riyadh')!;
  assert.equal(riyadh.rank, 1);
  assert.equal(riyadh.population, 8591748);
  assert.equal(riyadh.share.toFixed(1), '26.7');
  assert.equal(regionStatistics('makkah')!.population, 8021463);
  assert.equal(regionStatistics('madinah')!.population, 2137983);
  assert.equal(regionStatistics('bahah')!.rank, 13);
  assert.equal(regionStatistics('alula'), null, 'AlUla is a governorate, never a fourteenth region');
  assert.match(CENSUS_2022.source.url, /^https:\/\/portal\.saudicensus\.sa\//);
});

function mapMarkup(items: Entry[], locale: Locale): string {
  // Render the server-built SVG without the client wrapper, which needs Next's router context.
  const visual = (RegionExplorer({ entries: items, locale }).props.children as ReactElement<{ children: ReactNode[] }>[])[0];
  const map = visual.props.children.find(child => isValidElement(child) && typeof child.type === 'function' && child.type.name === 'RegionMap') as ReactElement<Record<string, unknown>>;
  const wrapper = (map.type as (props: unknown) => ReactElement<{ children: ReactElement }>)(map.props);
  return renderToStaticMarkup(wrapper.props.children);
}

test('each available region is a real link to its article with data and an accessible label', () => {
  for (const locale of ['ar', 'en'] as const) {
    const html = mapMarkup(entries, locale);
    assert.equal(html.match(/<a /g)?.length, 13);
    for (const slug of slugs) assert.ok(html.includes(`href="/${locale}/regions/${slug}"`), slug);
    assert.match(html, /data-region="riyadh"[^>]*data-population="8,591,748"/);
    assert.match(html, locale === 'ar' ? /aria-label="منطقة الرياض\. عدد السكان: 8,591,748\. المقر الإداري: الرياض"/ : /aria-label="Riyadh Region\. Population: 8,591,748\. Regional seat: Riyadh"/);
    assert.doesNotMatch(html, /<script|on[a-z]+=/i);
  }
});

test('regions without published articles are drawn but not linked', () => {
  const html = mapMarkup(entries.filter(entry => entry.slug !== 'najran'), 'en');
  assert.equal(html.match(/<a /g)?.length, 12);
  assert.equal(html.match(/region-shape unavailable/g)?.length, 1);
  assert.doesNotMatch(html, /\/regions\/najran/);
});
