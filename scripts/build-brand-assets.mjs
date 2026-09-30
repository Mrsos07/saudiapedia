// Builds the social-sharing image and site icons from the map logo (public/brand/saudi-map-logo.svg).
//   node scripts/build-brand-assets.mjs
// Outputs: public/brand/og-image.png (1200×630), public/brand/icon-192.png, public/brand/icon-512.png,
// public/brand/apple-touch-icon.png (180×180) and src/app/favicon.ico (48/32/16 px PNG entries).
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const logo = readFileSync('public/brand/saudi-map-logo.svg');
const GREEN = '#006C35'; const DEEP = '#123C2F'; const CREAM = '#F4EFE5'; const GOLD = '#B89B5E';

// Social card: deep green background, cream panel with the logo, bilingual title and domain.
const card = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="${DEEP}"/>
  <rect x="0" y="618" width="1200" height="12" fill="${GOLD}"/>
  <rect x="770" y="95" width="360" height="360" rx="28" fill="${CREAM}"/>
  <text x="700" y="250" text-anchor="end" font-family="Tahoma, Arial, sans-serif" font-size="68" font-weight="700" fill="#FFFEFA">موسوعة المملكة</text>
  <text x="700" y="340" text-anchor="end" font-family="Tahoma, Arial, sans-serif" font-size="68" font-weight="700" fill="#FFFEFA">العربية السعودية</text>
  <text x="700" y="415" text-anchor="end" font-family="Arial, sans-serif" font-size="36" fill="#E8D8B2">Encyclopedia of Saudi Arabia</text>
  <text x="700" y="540" text-anchor="end" font-family="Arial, sans-serif" font-size="30" fill="${GOLD}">saudiknowledge.com</text>
</svg>`);
const logoOnCard = await sharp(logo).resize(300, 300, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
await sharp(card).composite([{ input: logoOnCard, top: 125, left: 800 }]).png({ compressionLevel: 9 }).toFile('public/brand/og-image.png');

// Square icons: logo on cream with a small margin so it stays legible at 16 px.
async function icon(size) {
  const inner = Math.round(size * 0.84);
  const mark = await sharp(logo).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: CREAM } })
    .composite([{ input: mark, gravity: 'center' }]).png({ compressionLevel: 9 }).toBuffer();
}
writeFileSync('public/brand/icon-192.png', await icon(192));
writeFileSync('public/brand/icon-512.png', await icon(512));
writeFileSync('public/brand/apple-touch-icon.png', await icon(180));

// ICO container with PNG-encoded images (supported by all current browsers and search engines).
const sizes = [48, 32, 16];
const images = await Promise.all(sizes.map(icon));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, index) => {
  const entry = 6 + index * 16;
  header.writeUInt8(size, entry); header.writeUInt8(size, entry + 1); header.writeUInt8(0, entry + 2); header.writeUInt8(0, entry + 3);
  header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(images[index].length, entry + 8); header.writeUInt32LE(offset, entry + 12);
  offset += images[index].length;
});
writeFileSync('src/app/favicon.ico', Buffer.concat([header, ...images]));
console.log('brand assets written', GREEN);
