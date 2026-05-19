"use client";

import type { ReactNode } from "react";
import { cx } from "../_lib/utils";

// ── Shared palette ───────────────────────────────────────────────────────────
// Matches tokens in globals.css — kept as literal hex so SVG stroke/fill work
// without relying on Tailwind JIT for arbitrary color interpolation.
export const CHART_COLORS = {
  brand:   "#214f92",
  brandLt: "#dae7f4",
  accent:  "#f59e0b",
  success: "#10b981",
  danger:  "#e11d48",
  warning: "#b45309",
  slate:   "#64748b",
  slateLt: "#e2e8f0",
} as const;

// ── LineChart ────────────────────────────────────────────────────────────────
// Multi-series line (1–2 series). Data points are [label, value] pairs.

export interface LineSeries {
  name: string;
  color: string;
  values: number[];
}

export function LineChart({
  labels,
  series,
  height = 180,
  yTicks = 4,
  className,
}: {
  labels: string[];
  series: LineSeries[];
  height?: number;
  yTicks?: number;
  className?: string;
}) {
  const W = 600;
  const H = height;
  const padL = 32, padR = 8, padT = 12, padB = 22;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const all = series.flatMap((s) => s.values);
  const max = Math.max(1, ...all);
  const min = 0;

  const x = (i: number) =>
    labels.length <= 1 ? padL + chartW / 2 : padL + (i / (labels.length - 1)) * chartW;
  const y = (v: number) => padT + chartH - ((v - min) / (max - min)) * chartH;

  const toPath = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  const toArea = (vals: number[]) =>
    `${toPath(vals)} L${x(vals.length - 1).toFixed(1)},${(padT + chartH).toFixed(1)} L${x(0).toFixed(1)},${(padT + chartH).toFixed(1)} Z`;

  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => (max * i) / yTicks);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cx("w-full", className)} preserveAspectRatio="none">
      {/* Grid */}
      {ticks.map((t, i) => {
        const yy = y(t);
        return (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={yy} y2={yy} stroke={CHART_COLORS.slateLt} strokeWidth={1} strokeDasharray="2 3" />
            <text x={padL - 6} y={yy + 3} textAnchor="end" fontSize="9" fill={CHART_COLORS.slate}>
              {Math.round(t)}
            </text>
          </g>
        );
      })}

      {/* X labels — thinned if many */}
      {labels.map((l, i) => {
        const every = Math.max(1, Math.ceil(labels.length / 10));
        if (i % every !== 0 && i !== labels.length - 1) return null;
        return (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill={CHART_COLORS.slate}>
            {l}
          </text>
        );
      })}

      {/* Series */}
      {series.map((s, si) => (
        <g key={si}>
          <path d={toArea(s.values)} fill={s.color} opacity={0.08} />
          <path d={toPath(s.values)} fill="none" stroke={s.color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
          {s.values.map((v, i) => (
            <circle key={i} cx={x(i)} cy={y(v)} r={2} fill={s.color}>
              <title>{`${s.name} · ${labels[i]}: ${v}`}</title>
            </circle>
          ))}
        </g>
      ))}
    </svg>
  );
}

// ── BarChart (horizontal) ────────────────────────────────────────────────────

export interface BarDatum {
  label: string;
  value: number;
  color?: string;
  secondary?: { label: string; value: number };
}

export function HBarChart({
  data,
  max: maxProp,
  valueFormatter = (v) => v.toLocaleString(),
  className,
}: {
  data: BarDatum[];
  max?: number;
  valueFormatter?: (v: number) => string;
  className?: string;
}) {
  const max = maxProp ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <div className={cx("space-y-2", className)}>
      {data.map((d, i) => {
        const pct = (d.value / max) * 100;
        return (
          <div key={i} className="group">
            <div className="mb-1 flex items-center justify-between gap-2 text-[11.5px]">
              <span className="truncate font-medium text-slate-700">{d.label}</span>
              <span className="num shrink-0 font-semibold text-slate-900">{valueFormatter(d.value)}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: d.color ?? CHART_COLORS.brand }}
              />
            </div>
            {d.secondary && (
              <div className="mt-0.5 text-[10.5px] text-slate-500">
                {d.secondary.label}: <span className="num font-semibold">{d.secondary.value}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Histogram (vertical bars with labels) ────────────────────────────────────

export function Histogram({
  bins,
  height = 160,
  colorFor,
  className,
}: {
  bins: { label: string; value: number; hint?: string }[];
  height?: number;
  colorFor?: (bin: { label: string; value: number }, idx: number) => string;
  className?: string;
}) {
  const max = Math.max(1, ...bins.map((b) => b.value));
  return (
    <div className={cx("flex w-full items-end gap-1.5", className)} style={{ height }}>
      {bins.map((b, i) => {
        const h = (b.value / max) * (height - 32);
        const color = colorFor?.(b, i) ?? CHART_COLORS.brand;
        return (
          <div key={i} className="flex flex-1 flex-col items-center justify-end">
            <div className="num mb-1 text-[11px] font-semibold text-slate-700">{b.value}</div>
            <div
              className="w-full rounded-t-md transition-all"
              style={{ height: Math.max(2, h), backgroundColor: color }}
              title={b.hint ?? `${b.label}: ${b.value}`}
            />
            <div className="mt-1.5 text-center text-[10px] font-medium text-slate-500">{b.label}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Donut chart ──────────────────────────────────────────────────────────────
// Proportional donut. Each slice is rendered as an SVG circle stroke with
// `pathLength="100"` so we can size each slice in percent without trig.

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export function Donut({
  slices,
  size = 180,
  thickness = 22,
  centerLabel,
  centerSub,
  className,
}: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: ReactNode;
  centerSub?: ReactNode;
  className?: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const cx_ = size / 2;
  const cy_ = size / 2;
  const r = (size - thickness) / 2;

  let cumulative = 0;

  return (
    <div className={cx("relative inline-block", className)} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="-rotate-90">
        <circle cx={cx_} cy={cy_} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={thickness} />
        {total > 0 &&
          slices.map((s, i) => {
            const pct = (s.value / total) * 100;
            const dash = `${pct} ${100 - pct}`;
            const offset = -cumulative;
            cumulative += pct;
            return (
              <circle
                key={i}
                cx={cx_}
                cy={cy_}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={dash}
                strokeDashoffset={offset}
                pathLength={100}
                strokeLinecap="butt"
              >
                <title>{`${s.label}: ${s.value.toLocaleString()} (${pct.toFixed(1)}%)`}</title>
              </circle>
            );
          })}
      </svg>
      {(centerLabel || centerSub) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {centerLabel && <div className="num text-xl font-bold leading-tight">{centerLabel}</div>}
          {centerSub && <div className="text-[10px] uppercase tracking-wider opacity-70">{centerSub}</div>}
        </div>
      )}
    </div>
  );
}

// ── Heatmap (7×24 day × hour) ────────────────────────────────────────────────

export function Heatmap({
  matrix,
  rowLabels,
  colLabels,
  className,
}: {
  matrix: number[][]; // rows × cols
  rowLabels: string[];
  colLabels: string[];
  className?: string;
}) {
  const flat = matrix.flat();
  const max = Math.max(1, ...flat);
  return (
    <div className={cx("w-full", className)}>
      <div className="mb-1 ml-8 grid" style={{ gridTemplateColumns: `repeat(${colLabels.length}, minmax(0, 1fr))` }}>
        {colLabels.map((c, i) => (
          <div key={i} className="text-center text-[9px] font-medium text-slate-500">
            {i % 2 === 0 ? c : ""}
          </div>
        ))}
      </div>
      {matrix.map((row, ri) => (
        <div key={ri} className="mb-0.5 flex items-center gap-1">
          <div className="w-7 text-[10px] font-semibold text-slate-500">{rowLabels[ri]}</div>
          <div
            className="grid flex-1 gap-[2px]"
            style={{ gridTemplateColumns: `repeat(${colLabels.length}, minmax(0, 1fr))` }}
          >
            {row.map((v, ci) => {
              const intensity = v / max;
              const bg = intensity === 0
                ? "#f1f5f9"
                : `rgba(33, 79, 146, ${0.15 + intensity * 0.85})`;
              return (
                <div
                  key={ci}
                  className="aspect-square rounded-[3px]"
                  style={{ backgroundColor: bg }}
                  title={`${rowLabels[ri]} · ${colLabels[ci]}: ${v}`}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Stacked Area (for incident trends by severity) ───────────────────────────

export interface StackSeries {
  name: string;
  color: string;
  values: number[];
}

export function StackedArea({
  labels,
  series,
  height = 180,
  className,
}: {
  labels: string[];
  series: StackSeries[];
  height?: number;
  className?: string;
}) {
  const W = 600;
  const H = height;
  const padL = 28, padR = 8, padT = 10, padB = 22;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const n = labels.length;
  const totals = Array.from({ length: n }, (_, i) =>
    series.reduce((s, ser) => s + (ser.values[i] ?? 0), 0)
  );
  const max = Math.max(1, ...totals);
  const x = (i: number) => (n <= 1 ? padL + chartW / 2 : padL + (i / (n - 1)) * chartW);
  const y = (v: number) => padT + chartH - (v / max) * chartH;

  const stacked: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (const s of series) {
      acc += s.values[i] ?? 0;
      stacked[i]!.push(acc);
    }
  }

  const paths = series.map((s, si) => {
    const top = stacked.map((row) => row[si]!);
    const bottom = si === 0
      ? new Array(n).fill(0)
      : stacked.map((row) => row[si - 1]!);
    const up = top.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const down = bottom.map((v, i) => `L${x(n - 1 - i).toFixed(1)},${y(bottom[n - 1 - i]!).toFixed(1)}`).join(" ");
    return `${up} ${down} Z`;
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cx("w-full", className)} preserveAspectRatio="none">
      {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
        <line key={i} x1={padL} x2={W - padR} y1={padT + chartH * p} y2={padT + chartH * p}
          stroke={CHART_COLORS.slateLt} strokeWidth={1} strokeDasharray="2 3" />
      ))}
      {paths.map((d, i) => (
        <path key={i} d={d} fill={series[i]!.color} opacity={0.85} />
      ))}
      {labels.map((l, i) => {
        const every = Math.max(1, Math.ceil(labels.length / 8));
        if (i % every !== 0 && i !== labels.length - 1) return null;
        return (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill={CHART_COLORS.slate}>
            {l}
          </text>
        );
      })}
      <text x={padL - 4} y={padT + 4} textAnchor="end" fontSize="9" fill={CHART_COLORS.slate}>{max}</text>
      <text x={padL - 4} y={padT + chartH} textAnchor="end" fontSize="9" fill={CHART_COLORS.slate}>0</text>
    </svg>
  );
}

// ── Funnel ───────────────────────────────────────────────────────────────────

export function Funnel({
  steps,
  className,
}: {
  steps: { label: string; value: number; sub?: string }[];
  className?: string;
}) {
  const top = Math.max(1, steps[0]?.value ?? 1);
  return (
    <div className={cx("space-y-1.5", className)}>
      {steps.map((s, i) => {
        const pct = (s.value / top) * 100;
        const dropPct = i === 0 ? 0 : 100 - (s.value / (steps[i - 1]?.value || 1)) * 100;
        return (
          <div key={i}>
            <div className="mb-1 flex items-center justify-between text-[11.5px]">
              <div className="flex items-center gap-2">
                <span className="num flex h-5 w-5 items-center justify-center rounded-full bg-brand-50 text-[10px] font-bold text-brand-700">
                  {i + 1}
                </span>
                <span className="font-semibold text-slate-800">{s.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="num text-[12px] font-bold text-slate-900">{s.value.toLocaleString()}</span>
                {i > 0 && dropPct > 0 && (
                  <span className="rounded-full bg-danger-50 px-1.5 py-0.5 text-[10px] font-semibold text-danger-700">
                    −{dropPct.toFixed(0)}%
                  </span>
                )}
              </div>
            </div>
            <div
              className="h-7 rounded-md bg-gradient-to-r from-brand-600 to-brand-400"
              style={{ width: `${Math.max(8, pct)}%` }}
            />
            {s.sub && <div className="mt-0.5 text-[10.5px] text-slate-500">{s.sub}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ── Scatter (warehouse risk matrix) ──────────────────────────────────────────

export interface ScatterPoint {
  label: string;
  x: number;
  y: number;
  r?: number;
  color?: string;
}

export function Scatter({
  points,
  xLabel,
  yLabel,
  xMax: xMaxProp,
  yMax: yMaxProp,
  height = 220,
  className,
}: {
  points: ScatterPoint[];
  xLabel: string;
  yLabel: string;
  xMax?: number;
  yMax?: number;
  height?: number;
  className?: string;
}) {
  const W = 600;
  const H = height;
  // Generous right + top padding so circles at xMax/yMax aren't clipped
  const padL = 36, padR = 24, padT = 24, padB = 30;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  // Scale to 110% of actual max so extreme points sit inside the axes
  const rawXMax = Math.max(1, ...points.map((p) => p.x));
  const rawYMax = Math.max(1, ...points.map((p) => p.y));
  const xMax = xMaxProp ?? (rawXMax === 1 ? 1 : Math.ceil(rawXMax * 1.15));
  const yMax = yMaxProp ?? (rawYMax === 1 ? 1 : Math.ceil(rawYMax * 1.15));
  const px = (v: number) => padL + (v / xMax) * chartW;
  const py = (v: number) => padT + chartH - (v / yMax) * chartH;

  // Stagger labels that share the same pixel position so they don't overlap
  const labelOffsets = points.map((p, i) => {
    const pcx = px(p.x);
    const pcy = py(p.y);
    const samePos = points.slice(0, i).filter(
      (q) => Math.abs(px(q.x) - pcx) < 2 && Math.abs(py(q.y) - pcy) < 2
    ).length;
    return { dx: 9, dy: 3 + samePos * 11 };
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cx("w-full", className)} preserveAspectRatio="none">
      {/* Quadrant shading — top-right = danger zone */}
      <rect x={padL + chartW / 2} y={padT} width={chartW / 2} height={chartH / 2}
        fill={CHART_COLORS.danger} opacity={0.05} />

      {/* Grid */}
      {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={padT + chartH * p} y2={padT + chartH * p}
            stroke={CHART_COLORS.slateLt} strokeWidth={1} strokeDasharray="2 3" />
          <line y1={padT} y2={padT + chartH} x1={padL + chartW * p} x2={padL + chartW * p}
            stroke={CHART_COLORS.slateLt} strokeWidth={1} strokeDasharray="2 3" />
        </g>
      ))}

      {/* Axes labels */}
      <text x={padL + chartW / 2} y={H - 6} textAnchor="middle" fontSize="10" fill={CHART_COLORS.slate}>
        {xLabel} →
      </text>
      <text
        x={-padT - chartH / 2} y={12}
        transform={`rotate(-90)`} textAnchor="middle" fontSize="10" fill={CHART_COLORS.slate}
      >
        {yLabel} →
      </text>

      {/* Points */}
      {points.map((p, i) => (
        <g key={i}>
          <circle
            cx={px(p.x)} cy={py(p.y)} r={p.r ?? 6}
            fill={p.color ?? CHART_COLORS.brand} fillOpacity={0.55}
            stroke={p.color ?? CHART_COLORS.brand} strokeWidth={1.2}
          >
            <title>{`${p.label} · ${xLabel}: ${p.x} · ${yLabel}: ${p.y}`}</title>
          </circle>
          <text
            x={px(p.x) + labelOffsets[i]!.dx}
            y={py(p.y) + labelOffsets[i]!.dy}
            fontSize="9" fill={CHART_COLORS.slate}
          >
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ── Chart legend helper ──────────────────────────────────────────────────────

export function Legend({
  items,
  className,
}: {
  items: { label: string; color: string }[];
  className?: string;
}) {
  return (
    <div className={cx("flex flex-wrap items-center gap-3 text-[11px] text-slate-600", className)}>
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: it.color }} />
          {it.label}
        </div>
      ))}
    </div>
  );
}

// ── ChartCard — shared header wrapper for chart widgets ──────────────────────

export function ChartCard({
  title,
  subtitle,
  right,
  children,
  footnote,
  className,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  footnote?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("rounded-xl border border-slate-200 bg-white p-5 shadow-xs", className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold tracking-tight text-slate-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[11.5px] text-slate-500">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
      {footnote && <div className="mt-3 text-[11px] text-slate-500">{footnote}</div>}
    </div>
  );
}
