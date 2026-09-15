export type ImageCreditPart = { text: string; href?: string };

// URL parsing otherwise silently removes some controls. Also reject bidi format
// controls in URLs; ordinary Arabic credit text is still rendered unchanged.
const controls = /[\p{Cc}\p{Cf}]/u;

function trimURLPunctuation(value: string): string {
  const pairs = [['(', ')'], ['[', ']'], ['{', '}']] as const;
  const excess = new Map<string, number>(pairs.map(([open, close]) => [close,
    [...value].filter(char => char === close).length - [...value].filter(char => char === open).length,
  ]));
  let end = value.length;
  while (end > 0) {
    const last = value[end - 1];
    if (/[.,;:!?،؛؟…»”]/u.test(last)) end -= 1;
    else if ((excess.get(last) ?? 0) > 0) {
      excess.set(last, excess.get(last)! - 1);
      end -= 1;
    } else break;
  }
  return value.slice(0, end);
}

function safeURL(value: string): boolean {
  try {
    const decoded = decodeURIComponent(value);
    if (controls.test(decoded) || decoded.includes('\\') || /\s/u.test(value)) return false;
    const url = new URL(value);
    // Require an explicit authority, not a URL repaired by the WHATWG parser.
    const authority = /^https?:\/\/([^/?#]+)/i.exec(value)?.[1];
    return Boolean(authority && !authority.includes('@') && !value.includes('\\')
      && (url.protocol === 'https:' || url.protocol === 'http:')
      && url.hostname && !url.username && !url.password);
  } catch {
    return false;
  }
}

/** Plain text segments only: the caller renders text/anchors through React. */
export function imageCreditParts(text: string): ImageCreditPart[] {
  // Fail closed rather than linkifying a safe-looking prefix of a control-split URL.
  if (controls.test(text)) return [{ text }];
  const parts: ImageCreditPart[] = [];
  let cursor = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>"'`]+/gi)) {
    const start = match.index;
    // Do not extract HTTP substrings from other schemes or embedded identifiers.
    if (start > 0 && !/[\s([{<>'"«“]/u.test(text[start - 1])) continue;
    const candidate = trimURLPunctuation(match[0]);
    if (!safeURL(candidate)) continue;
    if (start > cursor) parts.push({ text: text.slice(cursor, start) });
    parts.push({ text: candidate, href: candidate });
    cursor = start + candidate.length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts;
}