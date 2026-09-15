import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import { hasRole, roles } from '../../src/collections/access';
import { loginLanguage } from '../../src/components/admin/login-copy';

// Source/copy contracts intentionally avoid importing the server component's
// Payload client boundary, starting Next, or opening a database connection.
const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const dashboardPath = 'src/components/admin/editorial-dashboard.tsx';

function objectLiteral(node: ts.Node | undefined): ts.ObjectLiteralExpression {
  assert.ok(node, 'Expected an object literal');
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) {
    return objectLiteral(node.expression);
  }
  assert.ok(ts.isObjectLiteralExpression(node), 'Expected an object literal');
  return node;
}

function property(object: ts.ObjectLiteralExpression, name: string): ts.Expression {
  const entry = object.properties.find((item) => ts.isPropertyAssignment(item)
    && (ts.isIdentifier(item.name) || ts.isStringLiteral(item.name)) && item.name.text === name);
  assert.ok(entry && ts.isPropertyAssignment(entry), `Missing property: ${name}`);
  return entry.initializer;
}

function namedObject(text: string, name: string): ts.ObjectLiteralExpression {
  const file = ts.createSourceFile('contract.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name) {
        return objectLiteral(declaration.initializer);
      }
    }
  }
  assert.fail(`Missing object: ${name}`);
}

function strings(object: ts.ObjectLiteralExpression): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of object.properties) {
    assert.ok(ts.isPropertyAssignment(entry));
    assert.ok(ts.isIdentifier(entry.name) || ts.isStringLiteral(entry.name));
    assert.ok(ts.isStringLiteral(entry.initializer));
    assert.ok(entry.initializer.text.trim().length > 0);
    result[entry.name.text] = entry.initializer.text;
  }
  return result;
}

function bilingual(node: ts.Expression): void {
  const labels = strings(objectLiteral(node));
  assert.deepEqual(Object.keys(labels).sort(), ['ar', 'en']);
  assert.match(labels.ar, /[\u0600-\u06ff]/);
  assert.match(labels.en, /[A-Za-z]/);
}

test('dashboard copy has equivalent keys, Arabic fallback, and honest document count labels', async () => {
  const text = await source(dashboardPath);
  const copy = namedObject(text, 'dashboardCopy');
  const ar = strings(objectLiteral(property(copy, 'ar')));
  const en = strings(objectLiteral(property(copy, 'en')));
  assert.deepEqual(Object.keys(ar).sort(), Object.keys(en).sort());
  for (const value of Object.values(ar)) assert.match(value, /[\u0600-\u06ff]/);
  assert.equal(ar.articles, 'وثائق المقالات (كل لغة مستقلة)');
  assert.equal(en.articles, 'Article documents (each language counted separately)');
  assert.equal(ar.unavailable, 'غير متاح');
  assert.equal(en.unavailable, 'Unavailable');
  assert.match(ar.countNote, /ليست عدد الموضوعات/);
  assert.match(en.countNote, /not counts of topics/);
  assert.match(en.authorsDescription, /not login accounts/);
  for (const language of [undefined, 'fr', 'ar']) assert.equal(loginLanguage(language), 'ar');
  assert.equal(loginLanguage('en'), 'en');
  assert.match(text, /loginLanguage\(i18n\.language\)/);
  assert.match(text, /lang=\{locale\} dir=\{locale === 'ar' \? 'rtl' : 'ltr'\}/);
});

test('dashboard guards server counts with the real users collection and allowed roles', async () => {
  const text = await source(dashboardPath);
  assert.match(text, /export async function EditorialDashboard\([\s\S]*?Pick<ServerProps, 'i18n' \| 'user' \| 'payload'>/);
  const guard = text.indexOf('if (!user || !hasRole({ user }, roles)) return null;');
  assert.ok(guard >= 0 && guard < text.indexOf('await payload.count'));
  assert.equal(hasRole({ user: null }, roles), false);
  for (const role of roles) {
    assert.equal(hasRole({ user: { id: 'staff-contract', collection: 'users', role } }, roles), true);
    assert.equal(hasRole({ user: { id: 'author-contract', collection: 'authors', role } }, roles), false);
  }
  assert.equal(hasRole({ user: { id: 'unknown-contract', collection: 'users', role: 'visitor' } }, roles), false);
  assert.doesNotMatch(text, /['"]use client['"]|['"]use cache['"]|unstable_cache|\bcache\s*\(|process\.env|payload\.config|\bgetPayload\b/);
  assert.match(text, /<LoginLanguageSwitch \/>/);
  assert.doesNotMatch(text, /<LoginLanguageSwitch\s+(?:user|payload|i18n)=/);
});

test('only three permission-aware live counts run and failures never become zero', async () => {
  const text = await source(dashboardPath);
  assert.match(text, /countedCollections = \['articles', 'categories', 'authors'\] as const/);
  assert.match(text, /Promise\.all\(countedCollections\.map/);
  assert.match(text, /payload\.count\(\{ collection, overrideAccess: false, user \}\)/);
  assert.equal(text.match(/payload\.count\(/g)?.length, 1);
  // The only additional live read is the permission-aware sections list
  // (payload.find on the `sections` collection), asserted separately below.
  assert.doesNotMatch(text, /payload\.(?:findByID|db|create|update|delete)|overrideAccess: true|disableErrors:\s*true/);
  assert.equal(text.match(/payload\.find\(/g)?.length, 1);
  assert.match(text, /payload\.find\(\{ collection: 'sections', overrideAccess: false, user,/);
  assert.match(text, /Number\.isSafeInteger\(totalDocs\) && totalDocs >= 0 \? totalDocs : null/);
  assert.match(text, /catch \{[\s\S]*?return \{ collection, total: null \}/);
  assert.match(text, /total === null \? copy\.unavailable : numberFormat\.format\(total\)/);
  assert.doesNotMatch(text, /error\.message|error\.stack|console\.|total:\s*0|\?\?\s*0/);
});

test('management links use serialized Payload list filters, and sections are loaded live (not a compiled-in list)', async () => {
  const text = await source(dashboardPath);
  assert.match(text, /href="\/admin\/collections\/articles\/create"/);
  assert.match(text, /\(\['categories', 'authors'\] as const\)\.map/);
  assert.match(text, /href=\{`\/admin\/collections\/\$\{collection\}`\}/);
  // Sections are administrator-managed data, not a compiled-in array: the
  // dashboard must query the sections collection at request time, the same
  // permission-aware way as the article/category/author counts.
  assert.doesNotMatch(text, /\['history', 'regions', 'people', 'heritage'\]/);
  assert.match(text, /payload\.find\(\{ collection: 'sections', overrideAccess: false, user, depth: 0, limit: 100, sort: 'order' \}\)/);
  assert.match(text, /new URLSearchParams\(\{ 'where\[section\]\[equals\]': slug \}\)/);
  assert.match(text, /return `\/admin\/collections\/articles\?\$\{query\.toString\(\)\}`/);
  assert.match(text, /href=\{sectionArticleURL\(section\.slug\)\}/);
  assert.match(text, /href="\/admin\/collections\/sections"/);
  for (const slug of ['history', 'a-new-section']) {
    const query = new URLSearchParams({ 'where[section][equals]': slug }).toString();
    assert.equal(query, `where%5Bsection%5D%5Bequals%5D=${slug}`);
    assert.equal(new URLSearchParams(query).get('where[section][equals]'), slug);
  }
});

test('touched collections have bilingual labels, groups, descriptions and every visible custom field label', async () => {
  const expectedFields = {
    Users: ['name', 'role', 'bootstrapKey'],
    Sources: ['title', 'url', 'publisher', 'accessedAt', 'notes'],
    Media: ['alt', 'attribution', 'license', 'published'],
  };
  for (const [name, names] of Object.entries(expectedFields)) {
    const config = namedObject(await source(`src/collections/${name}.ts`), name);
    const labels = objectLiteral(property(config, 'labels'));
    bilingual(property(labels, 'singular'));
    bilingual(property(labels, 'plural'));
    const admin = objectLiteral(property(config, 'admin'));
    bilingual(property(admin, 'group'));
    bilingual(property(admin, 'description'));
    const fields = property(config, 'fields');
    assert.ok(ts.isArrayLiteralExpression(fields));
    const found: string[] = [];
    for (const fieldNode of fields.elements) {
      const field = objectLiteral(fieldNode);
      const fieldName = property(field, 'name');
      assert.ok(ts.isStringLiteral(fieldName));
      found.push(fieldName.text);
      if (fieldName.text !== 'bootstrapKey') bilingual(property(field, 'label'));
    }
    assert.deepEqual(found, names, 'Presentation edits must not add or remove custom fields');
  }
});

test('dashboard CSS is appended, scoped, responsive, and does not add fonts or assets', async () => {
  const css = await source('src/app/(payload)/admin.css');
  const marker = '/* Editorial dashboard only.';
  assert.ok(css.includes(marker));
  const appended = css.slice(css.indexOf(marker));
  assert.doesNotMatch(appended, /@import|@font-face|url\(|font-family\s*:|:root|\[dir=['"]rtl['"]\]/);
  assert.match(appended, /\.cms-editorial-dashboard :is\(a, button\):focus-visible/);
  assert.match(appended, /@media \(max-width: 650px\)/);
  assert.match(appended, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(appended, /text-align: start/);
  assert.match(appended, /margin-block|padding-inline|border-block-start/);
  assert.doesNotMatch(await source(dashboardPath), /<img|<svg|lucide|flaticon|next\/font/);
});