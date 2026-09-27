'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FocusEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';

export type RegionMapLabels = { seat: string; population: string; share: string; rank: string; action: string };
type Tip = { name: string; seat: string; population: string; share: string; rank: string; left: number; top: number; transform: string };

const regionLink = (target: EventTarget | null) => (target instanceof Element ? target.closest<SVGAElement>('a[data-region]') : null);

/** Enhances a server-rendered SVG of region links: tooltip on hover/focus, client navigation on click. */
export function InteractiveRegionMap({ labels, children }: { labels: RegionMapLabels; children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [tip, setTip] = useState<Tip | null>(null);

  const show = (link: SVGAElement, x: number, y: number) => {
    const box = container.current?.getBoundingClientRect();
    if (!box) return;
    const { name = '', seat = '', population = '', share = '', rank = '' } = link.dataset;
    const horizontal = x > box.width * 0.55 ? 'calc(-100% - 14px)' : '14px';
    const vertical = y > box.height * 0.6 ? 'calc(-100% - 14px)' : '14px';
    setTip({ name, seat, population, share, rank, left: x, top: y, transform: `translate(${horizontal}, ${vertical})` });
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    const link = regionLink(event.target);
    const box = container.current?.getBoundingClientRect();
    if (!link || !box) { setTip(null); return; }
    show(link, event.clientX - box.left, event.clientY - box.top);
  };

  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    const link = regionLink(event.target);
    const box = container.current?.getBoundingClientRect();
    if (!link || !box) return;
    const shape = link.getBoundingClientRect();
    show(link, shape.left + shape.width / 2 - box.left, shape.top + shape.height / 2 - box.top);
  };

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const link = regionLink(event.target);
    const href = link?.getAttribute('href');
    if (!href || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    router.push(href);
  };

  return <div ref={container} className="region-map" onPointerMove={onPointerMove} onPointerLeave={() => setTip(null)} onFocus={onFocus} onBlur={() => setTip(null)} onClick={onClick}>
    {children}
    {tip && <div className="region-tooltip" aria-hidden="true" style={{ left: tip.left, top: tip.top, transform: tip.transform }}>
      <strong>{tip.name}</strong>
      <dl>
        <div><dt>{labels.seat}</dt><dd>{tip.seat}</dd></div>
        <div><dt>{labels.population}</dt><dd>{tip.population}</dd></div>
        <div><dt>{labels.share}</dt><dd>{tip.share}</dd></div>
        <div><dt>{labels.rank}</dt><dd>{tip.rank}</dd></div>
      </dl>
      <span>{labels.action}</span>
    </div>}
  </div>;
}
