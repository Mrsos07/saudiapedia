import type { RichNode } from './rich-text';

/** Authoring format shared by editorial batches and the CMS MCP server:
 * plain paragraphs where [[section/slug|label]] marks an internal link. */
export const INTERNAL_LINK = /\[\[([a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*)\|([^\]\n]{1,200})\]\]/g;
type Locale = 'ar' | 'en';

const text = (value: string) => ({ type: 'text', text: value, format: 0, detail: 0, mode: 'normal', style: '', version: 1 });

export function linkRoutes(paragraphs: string[]): string[] {
  return [...new Set(paragraphs.flatMap(paragraph => [...paragraph.matchAll(INTERNAL_LINK)].map(match => match[1])))];
}

/** Unresolved routes stay as plain text; the public renderer only links published targets anyway. */
export function paragraphsToLexical(paragraphs: string[], locale: Locale, resolve: (route: string) => number | string | undefined) {
  const direction = locale === 'ar' ? 'rtl' : 'ltr';
  const paragraph = (value: string) => {
    const children: unknown[] = [];
    let last = 0;
    for (const match of value.matchAll(INTERNAL_LINK)) {
      if (match.index > last) children.push(text(value.slice(last, match.index)));
      const id = resolve(match[1]);
      children.push(id !== undefined ? {
        type: 'link', version: 3, direction, format: '', indent: 0,
        fields: { linkType: 'internal', newTab: false, doc: { relationTo: 'articles', value: id } }, children: [text(match[2])],
      } : text(match[2]));
      last = match.index + match[0].length;
    }
    if (last < value.length) children.push(text(value.slice(last)));
    return { type: 'paragraph', version: 1, direction, format: '', indent: 0, textFormat: 0, children };
  };
  return { root: { type: 'root', version: 1, direction, format: '', indent: 0, children: paragraphs.filter(value => value.trim()).map(paragraph) } };
}

/** Inverse view for editing: block nodes become paragraphs, list items "- " lines, links [[route|label]]. */
export function richNodesToParagraphs(nodes: RichNode[] | undefined): string[] {
  if (!nodes) return [];
  const inline = (list: RichNode[]): string => list.map(node => {
    if (node.t === 'text') return node.v;
    if (node.t === 'br') return '\n';
    if (node.t === 'link') return node.ref ? `[[${node.ref.section}/${node.ref.slug}|${inline(node.c)}]]` : inline(node.c);
    return inline(node.c);
  }).join('');
  const out: string[] = [];
  for (const node of nodes) {
    if (node.t === 'ul' || node.t === 'ol') out.push(node.c.map(item => `- ${item.t === 'text' || item.t === 'br' ? '' : inline(item.c)}`).join('\n'));
    else if (node.t === 'text' || node.t === 'br' || node.t === 'link') out.push(inline([node]));
    else out.push(inline(node.c));
  }
  return out.map(value => value.trim()).filter(Boolean);
}
