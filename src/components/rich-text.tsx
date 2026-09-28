import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Locale } from '../lib/encyclopedia';
import type { RichNode } from '../lib/rich-text';

/** Renders the sanitized projection from src/lib/rich-text.ts as React elements only. */
export function RichText({ nodes, locale, sourceCount = 0 }: { nodes: RichNode[]; locale: Locale; sourceCount?: number }) {
  return <>{render(nodes, { locale, sourceCount })}</>;
}

type Context = { locale: Locale; sourceCount: number };

/** "[2]" becomes a link to the matching numbered source, as in plain-text articles. */
function citations(value: string, context: Context): ReactNode {
  const parts = value.split(/(\[[1-9]\d*\])/);
  if (parts.length === 1) return value;
  return parts.map((part, index) => {
    const number = /^\[([1-9]\d*)\]$/.exec(part)?.[1];
    if (!number || Number(number) > context.sourceCount) return part;
    return <a key={index} className="inline-citation" href={`#source-${number}`} aria-label={`${context.locale === 'ar' ? 'المصدر' : 'Source'} ${Number(number).toLocaleString(context.locale)}`}>[{Number(number).toLocaleString(context.locale)}]</a>;
  });
}

function text(node: Extract<RichNode, { t: 'text' }>, key: number, context: Context): ReactNode {
  let out: ReactNode = citations(node.v, context);
  if (node.f & 16) out = <code>{out}</code>;
  if (node.f & 8) out = <u>{out}</u>;
  if (node.f & 4) out = <s>{out}</s>;
  if (node.f & 2) out = <em>{out}</em>;
  if (node.f & 1) out = <strong>{out}</strong>;
  return <span key={key}>{out}</span>;
}

function render(nodes: RichNode[], context: Context): ReactNode[] {
  return nodes.map((node, key) => {
    switch (node.t) {
      case 'text': return text(node, key, context);
      case 'br': return <br key={key} />;
      case 'p': return <p key={key}>{render(node.c, context)}</p>;
      case 'h3': return <h3 key={key}>{render(node.c, context)}</h3>;
      case 'h4': return <h4 key={key}>{render(node.c, context)}</h4>;
      case 'quote': return <blockquote key={key}>{render(node.c, context)}</blockquote>;
      case 'ul': return <ul key={key}>{render(node.c, context)}</ul>;
      case 'ol': return <ol key={key}>{render(node.c, context)}</ol>;
      case 'li': return <li key={key}>{render(node.c, context)}</li>;
      case 'link': {
        const label = render(node.c, { ...context, sourceCount: 0 });
        if (node.ref) return <Link key={key} className="wiki-link" href={`/${context.locale}/${node.ref.section}/${node.ref.slug}`}>{label}</Link>;
        return <a key={key} href={node.href} target="_blank" rel="noreferrer">{label}</a>;
      }
    }
  });
}
