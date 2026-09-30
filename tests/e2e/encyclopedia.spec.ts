import { expect, test } from '@playwright/test';
import { entries, entryPath } from '../../src/lib/encyclopedia';

for (const locale of ['ar', 'en'] as const) {
  const ar = locale === 'ar';
  const label = ar ? 'شخصيات بارزة' : 'Notable figures';
  // The header shows the section name managed in the CMS (seed names in this CMS-disabled build).
  const navLabel = label;

  test(`${locale}: homepage history presents the three Saudi states in chronological order`, async ({ page }) => {
    await page.goto(`/${locale}`);
    const history = page.locator('#saudi-history');
    await expect(history.getByRole('heading', { level: 2 })).toHaveText(ar ? 'تاريخ الدول السعودية' : 'History of the Saudi States');
    await expect(history.locator('.entry-card h3')).toHaveText(ar
      ? ['الدولة السعودية الأولى', 'الدولة السعودية الثانية', 'الدولة السعودية الثالثة']
      : ['The First Saudi State', 'The Second Saudi State', 'The Third Saudi State']);
    const slugs = ['first-saudi-state', 'second-saudi-state', 'third-saudi-state'];
    for (const [index, slug] of slugs.entries()) {
      await expect(history.locator('.entry-card h3 a').nth(index)).toHaveAttribute('href', `/${locale}/history/${slug}`);
    }
    await expect(history.locator('.timeline-date > span:first-child')).toHaveText(['1727–1818', '1824–1891', '1902–']);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await history.locator('.entry-card h3 a').nth(2).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/history/third-saudi-state$`));
  });

  test(`${locale}: unified leaders section, categories, breadcrumbs and language switch`, async ({ page }) => {
    await page.goto(`/${locale}`);
    const link = page.locator('.desktop-nav').getByRole('link', { name: navLabel, exact: true });
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute('title', label);
    await expect(page.locator('a[href$="/rulers"], a[href$="/people"]')).toHaveCount(0);
    await expect(page.locator('.site-footer').getByRole('link', { name: label, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible();
    const kings = entries.filter(entry => entry.kind === 'ruler');
    await expect(page.locator('.people-grid .person-card')).toHaveCount(7);
    await expect(page.locator('.people-grid h3')).toHaveText(kings.map(entry => entry.title[locale]));
    await expect(page.locator('.people-grid .person-portrait img')).toHaveCount(7);
    await expect(page.locator('.people-grid a[href$="/ghazi-al-gosaibi"], .people-grid a[href$="/mohammed-abdu"]')).toHaveCount(0);
    // Subsection dropdown: the rulers' category first, linking to the filtered listing.
    const kingsCategory = ar ? 'ملوك المملكة العربية السعودية' : 'Kings of Saudi Arabia';
    const submenu = page.locator('.desktop-nav .nav-submenu');
    await expect(submenu).toBeHidden();
    await link.hover();
    await expect(submenu).toBeVisible();
    await expect(submenu.locator('a').first()).toHaveText(kingsCategory);
    await expect(submenu.locator('a').first()).toHaveAttribute('href', `/${locale}/notable-figures?category=${encodeURIComponent(kingsCategory)}`);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/notable-figures$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(label);
    await expect(link).toHaveAttribute('aria-current', 'page');
    const kingsTab = page.locator('.filter-tabs').getByRole('link', { name: ar ? 'ملوك المملكة العربية السعودية' : 'Kings of Saudi Arabia', exact: true });
    const allTab = page.locator('.filter-tabs').getByRole('link', { name: ar ? 'الكل' : 'All', exact: true });
    // The listing opens on the Kingdom's rulers by default.
    await expect(page.locator('.entry-card')).toHaveCount(7);
    await expect(page.locator('.entry-card h3')).toHaveText(kings.map(entry => entry.title[locale]));
    await expect(kingsTab).toHaveClass(/active/);
    await expect(page.locator('.filter-tabs a').nth(1)).toHaveText(ar ? 'ملوك المملكة العربية السعودية' : 'Kings of Saudi Arabia');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`/${locale}/notable-figures$`));
    await allTab.click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/notable-figures\\?category=all$`));
    await expect(page.locator('.entry-card')).toHaveCount(9);
    await expect(allTab).toHaveClass(/active/);
    await kingsTab.click();
    await expect(page.locator('.entry-card')).toHaveCount(7);
    await allTab.click();
    await expect(page.locator('.entry-card')).toHaveCount(9);
    await page.locator('.entry-card h3 a[href$="/king-abdulaziz"]').click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/people/king-abdulaziz$`));
    await expect(page.locator('.breadcrumbs').getByRole('link', { name: label, exact: true })).toHaveAttribute('href', `/${locale}/notable-figures`);
    await page.getByRole('link', { name: ar ? 'English' : 'العربية', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${ar ? 'en' : 'ar'}/people/king-abdulaziz$`));
    await expect(page.locator('.breadcrumbs').getByRole('link', { name: ar ? 'Notable figures' : 'شخصيات بارزة', exact: true })).toBeVisible();
  });

  test(`${locale}: old rulers URL permanently redirects and retains category queries`, async ({ page, request }) => {
    const category = ar ? 'ملوك المملكة العربية السعودية' : 'Kings of Saudi Arabia';
    const query = `?category=${encodeURIComponent(category)}&page=1`;
    for (const legacy of ['rulers', 'people']) for (const suffix of ['', query]) {
      const response = await request.get(`/${locale}/${legacy}${suffix}`, { maxRedirects: 0 });
      expect(response.status()).toBe(308);
      const destination = new URL(response.headers().location, 'http://localhost:3100');
      expect(destination.pathname).toBe(`/${locale}/notable-figures`);
      expect(destination.searchParams.get('category')).toBe(suffix ? category : null);
    }
    await page.goto(`/${locale}/rulers${query}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(label);
    await expect(page.locator('.entry-card')).toHaveCount(7);
  });

  test(`${locale}: search uses the unified section for rulers and biographies`, async ({ page }) => {
    await page.goto(`/${locale}/search?section=people`);
    await expect(page.locator('#section-filter option:checked')).toHaveText(label);
    await expect(page.locator('.entry-card')).toHaveCount(9);
    await expect(page.locator('.entry-card h3 a[href$="/king-salman"]')).toHaveCount(1);
    await expect(page.locator('.entry-card h3 a[href$="/hayat-sindi"]')).toHaveCount(1);
    await page.locator('#query').fill(ar ? 'عبدالعزيز' : 'Abdulaziz');
    await page.locator('.search-filters button').click();
    await expect(page.locator('.entry-card h3 a[href$="/king-abdulaziz"]')).toBeVisible();
  });

  test(`${locale}: unified mobile navigation fits narrow screens`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/${locale}`);
    await page.getByRole('button', { name: ar ? 'القائمة' : 'Menu', exact: true }).click();
    const menu = page.locator('#mobile-navigation');
    await expect(menu.locator('a[href$="/rulers"]')).toHaveCount(0);
    await menu.getByRole('link', { name: navLabel, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(label);
    await expect(menu).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test(`${locale}: every public preview article and section route remains available`, async ({ request }) => {
    test.setTimeout(120_000);
    const paths = ['', '/history', '/regions', '/people', '/notable-figures', '/heritage', '/about', '/editorial-policy', '/credits', '/privacy', '/search'];
    for (const path of [...paths.map(path => `/${locale}${path}`), ...entries.map(entry => entryPath(entry, locale))]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      expect(await response.text(), path).toContain('id="main-content"');
    }
  });
}

test('Arabic home, article and equivalent English route', async ({ page }) => {
  await page.goto('/ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('موسوعة السعودية');
  await expect(page.locator('.brand strong')).toHaveText('موسوعة السعودية');
  // Brand title appears once; the social card shows the logo; raster favicons for search engines.
  await expect(page).toHaveTitle('موسوعة المملكة العربية السعودية');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/brand\/og-image\.png$/);
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute('content', 'موسوعة المملكة العربية السعودية');
  await expect(page.locator('link[rel="icon"][href="/favicon.ico"]')).toHaveCount(1);
  for (const asset of ['/brand/og-image.png', '/favicon.ico', '/brand/icon-192.png', '/brand/apple-touch-icon.png']) {
    expect((await page.request.get(asset)).status(), asset).toBe(200);
  }
  await expect(page.getByText('أرضٌ تختصر عوالم')).toHaveCount(0);
  await page.locator('h3 a', { hasText: 'الدولة السعودية الأولى' }).click();
  await expect(page).toHaveURL(/\/ar\/history\/first-saudi-state$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('الدولة السعودية الأولى');
  await expect(page.getByText('هذه مقدمة تجريبية غير معتمدة.', { exact: false })).toBeVisible();
  await page.getByRole('link', { name: 'English', exact: true }).click();
  await expect(page).toHaveURL(/\/en\/history\/first-saudi-state$/);
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('.brand strong')).toHaveText('Saudi Encyclopedia');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('The First Saudi State');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/en\/history\/first-saudi-state$/);
});

test('Arabic search and empty results, with section filtering', async ({ page }) => {
  await page.goto('/ar/search');
  await page.getByLabel('كلمة البحث').fill('الرِّيَاض');
  await page.getByRole('combobox', { name: 'القسم', exact: true }).selectOption('regions');
  await page.getByRole('button', { name: 'بحث', exact: true }).click();
  await expect(page.locator('.entry-card')).toHaveCount(1);
  await expect(page.locator('.entry-card h3')).toContainText('الرياض');
  await page.getByLabel('كلمة البحث').fill('xyznotfound');
  await page.getByRole('button', { name: 'بحث', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'لم نعثر على نتائج' })).toBeVisible();
});

test('interactive region map shows census data on hover and focus, and opens the region', async ({ page }) => {
  await page.goto('/en/regions');
  const map = page.locator('.region-map');
  await expect(map.locator('a[data-region]')).toHaveCount(13);
  await expect(page.locator('.region-tooltip')).toHaveCount(0);
  await map.locator('a[data-region="riyadh"] path').hover();
  const tooltip = page.locator('.region-tooltip');
  await expect(tooltip).toContainText('Riyadh Region');
  await expect(tooltip).toContainText('8,591,748');
  await expect(tooltip).toContainText('1 of 13');
  await page.mouse.move(0, 0);
  await expect(tooltip).toHaveCount(0);
  await map.locator('a[data-region="jazan"]').focus();
  await expect(tooltip).toContainText('Jazan');
  await expect(tooltip).toContainText('1,404,997');
  await map.locator('a[data-region="asir"] path').click();
  await expect(page).toHaveURL(/\/en\/regions\/asir$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Asir');
});

test('region navigation, pagination and required public credits', async ({ page }) => {
  await page.goto('/en/regions');
  await expect(page.locator('.region-links a')).toHaveCount(13);
  await expect(page.locator('.entry-card')).toHaveCount(9);
  await page.locator('.pagination a').last().click();
  await expect(page.locator('.entry-card')).toHaveCount(4);
  await page.goto('/en/credits');
  await expect(page.locator('.credit-card')).toHaveCount(7);
  await expect(page.getByText('Sammy Six', { exact: true })).toBeVisible();
  await expect(page.getByText('S0lL0 TRAVELER', { exact: true })).toBeVisible();
});

test('homepage hero cycles through credited Saudi scenes, one visible credit at a time', async ({ page }) => {
  await page.goto('/ar');
  await expect(page.locator('.hero-slide img')).toHaveCount(6);
  const visibleCredits = () => page.locator('.hero-credit').evaluateAll(nodes => nodes.filter(node => getComputedStyle(node).visibility === 'visible').length);
  expect(await visibleCredits()).toBe(1);
  await expect(page.locator('.hero-credit').first()).toContainText('B.alotaby');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  expect(await page.locator('.hero-slide').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).opacity))).toEqual(['1', '0', '0', '0', '0', '0']);
  expect(await visibleCredits()).toBe(1);
});

test('mobile menu, layout width, inherited font and not-found', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ar');
  await page.getByRole('button', { name: 'القائمة', exact: true }).click();
  await page.locator('#mobile-navigation').getByRole('link', { name: 'التراث', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('التراث');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.locator('body').evaluate(el => getComputedStyle(el).fontFamily)).toContain('Zain');
  expect(await page.locator('.menu-toggle').evaluate(el => getComputedStyle(el).fontFamily)).toContain('Zain');
  const response = await page.goto('/ar/history/does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('هذه الصفحة غير متاحة');
});

test('security headers enforce nonce scripts and search renders hostile input as text', async ({ page, request }) => {
  await page.route('**/ar/search?*', async route => {
    const response = await route.fetch();
    const html = await response.text();
    await route.fulfill({ response, body: html.replace('</body>', '<script>window.__auditCSP = 1</script></body>') });
  });
  const response = await page.goto('/ar/search?q=' + encodeURIComponent('<img src=x onerror="window.__auditXSS=1">'));
  const headers = response!.headers();
  const csp = headers['content-security-policy'];
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("base-uri 'none'");
  expect(csp).toContain("frame-ancestors 'self'");
  expect(csp).toMatch(/script-src[^;]*'nonce-[A-Za-z0-9+/=]+'/);
  expect(csp.split('script-src ')[1].split(';')[0]).not.toMatch(/unsafe-inline|unsafe-eval/);
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['permissions-policy']).toContain('camera=()');
  expect(headers['strict-transport-security']).toContain('max-age=31536000');
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  expect(await page.evaluate(() => '__auditXSS' in window)).toBe(false);
  expect(await page.evaluate(() => '__auditCSP' in window)).toBe(false);
  const next = await request.get('/en');
  expect(next.headers()['content-security-policy']).not.toBe(csp);
});

test('protected media cannot enter the public image optimizer cache', async ({ request }) => {
  const result = await request.get('/_next/image?url=%2Fapi%2Fmedia%2Ffile%2Fsecurity-fixture.webp&w=640&q=75');
  expect(result.status()).toBe(400);
  expect(await result.text()).toContain('not allowed');
});

test('unconfigured admin/API stay guarded; preview is excluded from sitemap', async ({ page, request }) => {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('إعداد نظام إدارة المحتوى');
  const api = await request.get('/api/articles');
  expect(api.status()).toBe(503);
  expect(await (await request.get('/robots.txt')).text()).toContain('Disallow: /');
  expect(await (await request.get('/sitemap.xml')).text()).not.toContain('first-saudi-state');
});