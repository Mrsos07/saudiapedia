// Research helper: saves readable text of Saudipedia pages for editorial drafting.
// node scripts/research-saudipedia.mjs <outDir> key=page-title [key=page-title ...]
// Output is research material only; every drafted fact must still cite the page it came from.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [outDir, ...pairs] = process.argv.slice(2);
if (!outDir || !pairs.length) throw new Error('Usage: research-saudipedia.mjs <outDir> key=title ...');
mkdirSync(outDir, { recursive: true });
const decode = text => text.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&sup2;/g, '²').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&[a-z]+;/g, ' ');
for (const pair of pairs) {
  const [key, title] = pair.split('=');
  const url = `https://saudipedia.com/${encodeURIComponent(title)}`;
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 kingdomsaudi-editorial-research' }, signal: AbortSignal.timeout(60000) });
  const html = await response.text();
  const main = (html.match(/<main[\s\S]*?<\/main>/) ?? [html])[0];
  let text = decode(main.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<(br|\/p|\/h[1-6]|\/li|\/tr|\/div)[^>]*>/g, '\n').replace(/<\/t[dh]>/g, ' | ').replace(/<[^>]+>/g, ''));
  text = text.split('\n').map(line => line.replace(/\s+/g, ' ').trim())
    .filter(line => line && !/^(مقالة|د|copied|[0-9/]+|إغلاق|الاختبارات ذات الصلة)$/.test(line) && !/info=\d/.test(line));
  const end = text.findIndex(line => line === 'جدول المحتويات');
  const body = end > 0 ? text.slice(0, end) : text;
  const infobox = end > 0 ? text.slice(text.indexOf('صندوق المعلومات') + 1) : [];
  writeFileSync(path.join(outDir, `${key}.txt`), [url, `status ${response.status}`, ...body, '--- infobox ---', ...infobox].join('\n'));
  console.log(key, response.status, body.join(' ').length);
}
