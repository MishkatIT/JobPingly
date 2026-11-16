'use client';

import { useId, useMemo, useState } from 'react';
import { cn } from '@/lib/client/cn';
import { formatCompact, formatDate, formatNumber } from '@/lib/client/format';

/**
 * Small, dependency-free charts for the admin panel.
 *
 * Conventions: one axis only, thin bars with a rounded data end and a square
 * baseline, a 2px surface gap between stacked segments, recessive gridlines,
 * text in text colours (never the series colour), a legend whenever there
 * are two or more series, a tooltip on hover and keyboard focus, and a
 * "View as table" toggle so no value depends on hovering or on colour.
 */

export interface ChartSeries {
  key: string;
  label: string;
  /** CSS colour, normally one of the --chart-* variables. */
  color: string;
}

export interface BarChartProps {
  data: Record<string, unknown>[];
  /** Field holding the x value (a date). */
  x: string;
  series: ChartSeries[];
  /** Stack series on top of each other (otherwise only the first series is drawn). */
  stacked?: boolean;
  height?: number;
  title: string;
  description?: string;
  formatX?: (value: unknown) => string;
}

const PADDING = { top: 8, right: 4, bottom: 22, left: 34 };

function niceMax(value: number): number {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

export function BarChart({ data, x, series, stacked = false, height = 180, title, description, formatX }: BarChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const id = useId();
  const drawn = stacked ? series : series.slice(0, 1);
  const labelX = formatX ?? ((value: unknown) => formatDate(value as string, { day: 'numeric', month: 'short' }));

  const totals = useMemo(() => data.map(row => drawn.reduce((sum, item) => sum + (Number(row[item.key]) || 0), 0)), [data, drawn]);
  const max = niceMax(Math.max(1, ...totals));
  const width = 640;
  const innerWidth = width - PADDING.left - PADDING.right;
  const innerHeight = height - PADDING.top - PADDING.bottom;
  const band = innerWidth / Math.max(1, data.length);
  const barWidth = Math.min(24, Math.max(3, band * 0.62));
  const ticks = [0, max / 2, max];
  const scale = (value: number) => (value / max) * innerHeight;
  const labelEvery = Math.ceil(data.length / 7);

  return (
    <figure className="min-w-0" aria-labelledby={`${id}-title`}>
      <figcaption className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div id={`${id}-title`} className="text-base font-semibold text-ink">
            {title}
          </div>
          {description && <div className="text-sm text-muted">{description}</div>}
        </div>
        <div className="flex items-center gap-3">
          {drawn.length > 1 && (
            <ul className="flex items-center gap-3 text-sm text-muted" aria-label="Legend">
              {drawn.map(item => (
                <li key={item.key} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} aria-hidden="true" />
                  {item.label}
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => setShowTable(value => !value)} className="text-sm text-accent hover:text-accent-hover">
            {showTable ? 'View as chart' : 'View as table'}
          </button>
        </div>
      </figcaption>

      {showTable ? (
        <div className="scroll-slim max-h-64 overflow-auto rounded-md border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sunken text-left text-muted">
                <th scope="col" className="px-3 py-2 font-medium">Date</th>
                {drawn.map(item => (
                  <th key={item.key} scope="col" className="px-3 py-2 text-right font-medium">{item.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, index) => (
                <tr key={index} className="border-t border-line">
                  <td className="px-3 py-1.5 text-ink">{labelX(row[x])}</td>
                  {drawn.map(item => (
                    <td key={item.key} className="tabular px-3 py-1.5 text-right text-ink">{formatNumber(Number(row[item.key]) || 0)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={`${title}. Use the table view for exact values.`} onMouseLeave={() => setHover(null)}>
            {ticks.map(tick => {
              const y = PADDING.top + innerHeight - scale(tick);
              return (
                <g key={tick}>
                  <line x1={PADDING.left} x2={width - PADDING.right} y1={y} y2={y} stroke="rgb(var(--line))" strokeWidth={1} />
                  <text x={PADDING.left - 6} y={y + 3.5} textAnchor="end" className="fill-subtle" fontSize={10}>
                    {formatCompact(tick)}
                  </text>
                </g>
              );
            })}
            {data.map((row, index) => {
              const cx = PADDING.left + band * index + band / 2;
              let base = PADDING.top + innerHeight;
              const segments = drawn
                .map(item => ({ item, value: Number(row[item.key]) || 0 }))
                .filter(segment => segment.value > 0);
              return (
                <g key={index}>
                  {/* Hit target is the whole column, not just the painted bar. */}
                  <rect
                    x={PADDING.left + band * index}
                    y={PADDING.top}
                    width={band}
                    height={innerHeight}
                    fill="transparent"
                    tabIndex={0}
                    aria-label={`${labelX(row[x])}: ${drawn.map(item => `${item.label} ${formatNumber(Number(row[item.key]) || 0)}`).join(', ')}`}
                    onMouseEnter={() => setHover(index)}
                    onFocus={() => setHover(index)}
                    onBlur={() => setHover(null)}
                    className="outline-none"
                  />
                  {segments.map((segment, segmentIndex) => {
                    const h = Math.max(1.5, scale(segment.value) - (segmentIndex > 0 ? 2 : 0));
                    const top = base - h;
                    const isTop = segmentIndex === segments.length - 1;
                    const radius = isTop ? Math.min(4, barWidth / 2, h) : 0;
                    const path = `M${cx - barWidth / 2},${base} V${top + radius} Q${cx - barWidth / 2},${top} ${cx - barWidth / 2 + radius},${top} H${cx + barWidth / 2 - radius} Q${cx + barWidth / 2},${top} ${cx + barWidth / 2},${top + radius} V${base} Z`;
                    base = top - 2;
                    return <path key={segment.item.key} d={path} fill={segment.item.color} opacity={hover === null || hover === index ? 1 : 0.55} pointerEvents="none" />;
                  })}
                  {index % labelEvery === 0 && (
                    <text x={cx} y={height - 6} textAnchor="middle" className="fill-subtle" fontSize={10}>
                      {labelX(row[x])}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {hover !== null && data[hover] && (
            <div
              className="pointer-events-none absolute top-0 z-10 rounded-md border border-line bg-raised px-2.5 py-2 text-sm shadow-pop"
              style={{ left: `${Math.min(78, Math.max(2, ((PADDING.left + band * hover) / width) * 100))}%` }}
            >
              <div className="mb-1 text-xs text-muted">{labelX(data[hover][x])}</div>
              {drawn.map(item => (
                <div key={item.key} className="flex items-center gap-2 whitespace-nowrap">
                  <span className="h-0.5 w-3 rounded" style={{ background: item.color }} aria-hidden="true" />
                  <span className="tabular font-semibold text-ink">{formatNumber(Number(data[hover][item.key]) || 0)}</span>
                  <span className="text-muted">{item.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}

/** Horizontal proportion bar (one whole, split into labelled parts). */
export function SegmentBar({ parts, className, label }: { parts: { label: string; value: number; color: string }[]; className?: string; label: string }) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  return (
    <div className={className}>
      <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-sunken" role="img" aria-label={`${label}: ${parts.map(part => `${part.label} ${part.value}`).join(', ')}`}>
        {total > 0 &&
          parts
            .filter(part => part.value > 0)
            .map(part => <div key={part.label} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(part.value / total) * 100}%`, background: part.color }} />)}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
        {parts.map(part => (
          <li key={part.label} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: part.color }} aria-hidden="true" />
            {part.label} <span className={cn('tabular font-medium text-ink')}>{formatNumber(part.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
