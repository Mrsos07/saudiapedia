/** Safe, minimal projection of Payload Lexical JSON for public rendering.
 * Unknown node types keep only their text; no HTML, attributes, styles or scripts survive. */
export type RichNode =
  | { t: 'p' | 'h3' | 'h4' | 'quote' | 'ul' | 'ol' | 'li'; c: RichNode[] }
  | { t: 'text'; v: string; f: number }
  | { t: 'br' }
  | { t: 'link'; href?: string; ref?: { section: string; slug: string }; c: RichNode[] };

const MAX_NODES = 5000;
const MAX_DEPTH = 12;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** External links must be absolute HTTP(S) without credentials; everything else is dropped. */
export function safeExternalURL(value: unknown): string | undefined {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f\s]/u.test(value.trim())) return undefined;
  try {
    const url = new URL(value.trim());
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** Internal links resolve only when the linked article was populated by a public read. */
function internalRef(doc: unknown): { section: string; slug: string } | undefined {
  if (!record(doc) || !record(doc.value)) return undefined;
  const { section, slug } = doc.value;
  return typeof section === 'string' && typeof slug === 'string' && SLUG.test(section) && SLUG.test(slug) ? { section, slug } : undefined;
}

export function sanitizeRichText(value: unknown): RichNode[] | undefined {
  if (!record(value) || !record(value.root) || !Array.isArray(value.root.children)) return undefined;
  let count = 0;
  const walk = (nodes: unknown[], depth: number): RichNode[] => {
    const out: RichNode[] = [];
    for (const node of nodes) {
      if (++count > MAX_NODES || depth > MAX_DEPTH || !record(node)) break;
      const children = Array.isArray(node.children) ? walk(node.children, depth + 1) : [];
      switch (node.type) {
        case 'text':
          if (typeof node.text === 'string' && node.text) out.push({ t: 'text', v: node.text, f: typeof node.format === 'number' ? node.format & 31 : 0 });
          break;
        case 'linebreak': out.push({ t: 'br' }); break;
        case 'paragraph': out.push({ t: 'p', c: children }); break;
        case 'heading': out.push({ t: node.tag === 'h4' ? 'h4' : 'h3', c: children }); break;
        case 'quote': out.push({ t: 'quote', c: children }); break;
        case 'list': out.push({ t: node.listType === 'number' ? 'ol' : 'ul', c: children.filter(child => child.t === 'li') }); break;
        case 'listitem': out.push({ t: 'li', c: children }); break;
        case 'link':
        case 'autolink': {
          const fields = record(node.fields) ? node.fields : {};
          const ref = fields.linkType === 'internal' ? internalRef(fields.doc) : undefined;
          const href = fields.linkType === 'internal' ? undefined : safeExternalURL(fields.url);
          // Unpublished targets and unsafe URLs keep their words but lose the link.
          if (ref) out.push({ t: 'link', ref, c: children });
          else if (href) out.push({ t: 'link', href, c: children });
          else out.push(...children);
          break;
        }
        default: out.push(...children);
      }
    }
    return out;
  };
  const nodes = walk(value.root.children, 0).filter(node => !(node.t === 'p' && !node.c.length));
  return nodes.length ? nodes : undefined;
}

export function richTextPlain(nodes: RichNode[] | undefined): string {
  if (!nodes) return '';
  const parts: string[] = [];
  const walk = (list: RichNode[]) => {
    for (const node of list) {
      if (node.t === 'text') parts.push(node.v);
      else if (node.t === 'br') parts.push(' ');
      else { walk(node.c); if (node.t !== 'link') parts.push(' '); }
    }
  };
  walk(nodes);
  return parts.join('').replace(/\s+/g, ' ').trim();
}
