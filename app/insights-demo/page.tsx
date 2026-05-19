"use client";

/**
 * /insights-demo — TEMPORARY public preview route.
 *
 * Renders the new dark-glass Manager Insights layout with hardcoded sample
 * numbers (mirroring the Trichy DC POC). This bypasses the manager
 * layout / RoleGuard so the design can be reviewed without auth. Delete
 * this folder once the visual is approved.
 */

import { useMemo, useState } from "react";
import {
  AlertTriangle, ShieldAlert, Truck, Users, FileSearch, Clock,
  TrendingUp, Activity, BadgeCheck, AlertCircle, ArrowRight,
} from "lucide-react";
import { LineChart, Histogram, Donut, type DonutSlice } from "../_components/Charts";
import {
  InsightsShell, SectionTabs, GlassCard, Chip, RiskBadge,
  SectionHeader, INSIGHTS_PALETTE,
} from "../_components/insights/InsightsShell";
import { KpiTile, MiniStat } from "../_components/insights/KpiTile";
import { cx } from "../_lib/utils";

const SECTIONS = [
  { id: "overview",  label: "Overview"        },
  { id: "trucks",    label: "Truck Movement"  },
  { id: "providers", label: "Provider Intel"  },
  { id: "drivers",   label: "Driver Intel"    },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

// ── Mock data (mirrors Trichy DC POC) ────────────────────────────────────────
const MOCK = {
  warehouseName:    "Trichy DC",
  totalGateEvents:  767,
  totalDrivers:     536,
  invalidDl:        18,
  dlExpired:        6,
  driversWithCases: 45,
  totalCases:       112,
  criminal:         85,
  civil:            27,
  activeCriminal:   5,
  bgFlagged:        45,
  dlExpiring30:     12,
  openAlertsCount:  19,
  criticalAlerts:   3,
  spVolume: [
    { name: "LSG & Co",                 trucks: 198 },
    { name: "VARUN LOGISTICS",          trucks: 76  },
    { name: "AMMAN TRANSPORTS",         trucks: 54  },
    { name: "A L TRANS PRIVATE LIMITED",trucks: 41  },
    { name: "VAYUDOOT ROAD CARRIERS",   trucks: 33  },
    { name: "Other providers",          trucks: 16  },
  ],
  spRisk: [
    { spId: "1",  spName: "LSG & Co",                  total: 29, criminal: 15, civil: 0, activeCriminal: 3, dlExpired: 2,  noTransportDl: 4, invalidDl: 8 },
    { spId: "2",  spName: "VARUN LOGISTICS",           total: 14, criminal: 9,  civil: 0, activeCriminal: 1, dlExpired: 0,  noTransportDl: 0, invalidDl: 5 },
    { spId: "3",  spName: "AMMAN TRANSPORTS",          total: 8,  criminal: 6,  civil: 0, activeCriminal: 0, dlExpired: 0,  noTransportDl: 1, invalidDl: 1 },
    { spId: "4",  spName: "A L TRANS PRIVATE LIMITED", total: 3,  criminal: 2,  civil: 0, activeCriminal: 0, dlExpired: 0,  noTransportDl: 1, invalidDl: 0 },
    { spId: "5",  spName: "VAYUDOOT ROAD CARRIERS",    total: 3,  criminal: 1,  civil: 0, activeCriminal: 0, dlExpired: 1,  noTransportDl: 0, invalidDl: 1 },
    { spId: "6",  spName: "COSMO CARRYING PVT LTD",    total: 2,  criminal: 0,  civil: 0, activeCriminal: 0, dlExpired: 1,  noTransportDl: 0, invalidDl: 1 },
    { spId: "7",  spName: "JSM LOGISTICS PVT. LTD.",   total: 2,  criminal: 2,  civil: 0, activeCriminal: 0, dlExpired: 0,  noTransportDl: 0, invalidDl: 0 },
    { spId: "8",  spName: "TIRUPATI LOGISTICS PVT LTD",total: 2,  criminal: 2,  civil: 0, activeCriminal: 0, dlExpired: 0,  noTransportDl: 0, invalidDl: 0 },
    { spId: "9",  spName: "DELHIVERY LIMITED",         total: 1,  criminal: 0,  civil: 0, activeCriminal: 0, dlExpired: 1,  noTransportDl: 0, invalidDl: 0 },
    { spId: "10", spName: "KAPOOR DIESELS PVT LTD",    total: 1,  criminal: 1,  civil: 0, activeCriminal: 0, dlExpired: 0,  noTransportDl: 0, invalidDl: 0 },
  ],
  flow14d: Array.from({ length: 14 }, (_, i) => {
    const peaks = [85, 72, 60, 52, 48, 92, 128, 140, 132, 88, 65, 70, 95, 70];
    return { label: `${10 + i} Apr`, entries: peaks[i] ?? 60, exits: Math.max(0, (peaks[i] ?? 60) - 12) };
  }),
  dwell: {
    sampleCount: 221,
    avgMinutes:  410,
    p95Minutes:  720,
    bins: [
      { label: "<1h",   value: 8   },
      { label: "1-4h",  value: 38  },
      { label: "4-8h",  value: 31  },
      { label: "8-12h", value: 20  },
      { label: ">12h",  value: 124 },
    ],
  },
  alertsByType: [
    { type: "dl_expired",          count: 6, label: "Expired DL",          color: "#e11d48" },
    { type: "bg_flagged",          count: 5, label: "Background flagged",  color: "#ef4444" },
    { type: "dl_mismatch_at_exit", count: 4, label: "DL mismatch at exit", color: "#f97316" },
    { type: "dl_expiring",         count: 3, label: "DL expiring soon",    color: "#f59e0b" },
    { type: "face_mismatch",       count: 1, label: "Face mismatch",       color: "#ec4899" },
  ],
  urgentList: [
    { id: "1",  name: "PERIYASAMY C",  dlNumber: "TN33-20160004669", dlExpiryMs: Date.now() - 35 * 86400000, dlStatus: "expired", bgStatus: "flagged" },
    { id: "2",  name: "SAKTHIVEL S",   dlNumber: "TN27-Z20020001549", dlExpiryMs: Date.now() + 12 * 86400000, dlStatus: "valid",   bgStatus: "flagged" },
    { id: "3",  name: "SHANMUGAM A",   dlNumber: "TN47-19970003236", dlExpiryMs: Date.now() + 5  * 86400000, dlStatus: "valid",   bgStatus: "clear" },
    { id: "4",  name: "SARAVANAN J",   dlNumber: "TN27-Y20030001523", dlExpiryMs: Date.now() - 3  * 86400000, dlStatus: "expired", bgStatus: "flagged" },
    { id: "5",  name: "SURESH A",      dlNumber: "TN25-Z19950000571", dlExpiryMs: Date.now() + 22 * 86400000, dlStatus: "valid",   bgStatus: "flagged" },
  ],
};

const SUMMARY = {
  headline:  "75 high-risk entries surfaced at Trichy DC across 767 verified gate events",
  narrative: "Over the last 30 days, 767 gate events were processed at Trichy DC, covering 536 unique drivers. 45 drivers (8.4% of the pool) were flagged by Fraudcheck risk rules — 18 invalid DLs, 6 expired DLs, and 112 court records discovered. 5 of those records are still active criminal cases, which means a verified driver is currently entering site with an open matter. 19 alerts are open, 3 of them critical and awaiting acknowledgement.",
  insights: [
    "Tighten DL scan-at-gate — 18 invalid licences slipped through manual entry.",
    "Review 5 active criminal cases with security before the next inbound.",
    "LSG & Co carries the highest concentration of flags (29). Consider procurement review.",
  ],
};

export default function InsightsDemo() {
  const [active, setActive] = useState<SectionId>("overview");
  const m = MOCK;
  const highRisk = m.invalidDl + m.dlExpired + m.driversWithCases;

  const flowSeries = {
    labels: m.flow14d.map((d) => d.label),
    series: [
      { name: "Entries", color: INSIGHTS_PALETTE.brand,   values: m.flow14d.map((d) => d.entries) },
      { name: "Exits",   color: INSIGHTS_PALETTE.emerald, values: m.flow14d.map((d) => d.exits)   },
    ],
  };

  const spDonut = useMemo<DonutSlice[]>(() => {
    const palette = ["#3d94ff", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#475569"];
    return m.spVolume.map((sp, i) => ({ label: sp.name, value: sp.trucks, color: palette[i] ?? "#64748b" }));
  }, [m.spVolume]);

  const dwellDonut = useMemo<DonutSlice[]>(() => {
    const palette = ["#10b981", "#3d94ff", "#f59e0b", "#8b5cf6", "#ef4444"];
    return m.dwell.bins.map((b, i) => ({ label: b.label, value: b.value, color: palette[i] ?? "#64748b" }));
  }, [m.dwell.bins]);

  return (
    <InsightsShell>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Chip tone="brand" dot>Live · Last 30 days</Chip>
        <Chip>{m.warehouseName}</Chip>
        <Chip tone="red" dot>{m.criticalAlerts} critical alerts</Chip>
        <Chip tone="amber">DEMO · sample data</Chip>
      </div>

      <SectionTabs
        sections={SECTIONS.map((s) => ({ id: s.id, label: s.label }))}
        active={active}
        onChange={(id) => setActive(id as SectionId)}
      />

      {active === "overview" && (
        <div className="space-y-6">
          <SectionHeader
            chip={<Chip tone="brand">01 · Executive Brief</Chip>}
            title={
              <>
                Warehouse Intelligence
                <span className="block bg-gradient-to-r from-brand-300 via-brand-400 to-emerald-400 bg-clip-text text-transparent">
                  & Driver Verification
                </span>
              </>
            }
            subtitle={`Risk analysis, gate flow, driver compliance and provider intelligence for ${m.warehouseName}, last 30 days.`}
          />

          {/* ─ AI Summary (mock prerendered) ─ */}
          <GlassCard strong className="relative p-6 md:p-8" glow="brand">
            <div aria-hidden className="pointer-events-none absolute -top-12 -right-12 h-48 w-48 rounded-full blur-3xl" style={{ background: "rgba(61,148,255,.18)" }} />
            <div aria-hidden className="pointer-events-none absolute -bottom-16 -left-12 h-48 w-48 rounded-full blur-3xl" style={{ background: "rgba(139,92,246,.14)" }} />
            <div className="relative">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Chip tone="brand" dot>AI Executive Summary</Chip>
                <Chip tone="emerald">Generated by GPT</Chip>
              </div>
              <h3 className="bg-gradient-to-r from-brand-300 via-brand-400 to-emerald-400 bg-clip-text text-2xl font-bold leading-tight tracking-tight text-transparent md:text-3xl">
                {SUMMARY.headline}
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-slate-200 md:text-base">{SUMMARY.narrative}</p>
              <ul className="mt-5 grid gap-3 md:grid-cols-3">
                {SUMMARY.insights.map((insight, i) => (
                  <li key={i} className="rounded-xl border border-white/8 bg-white/[.03] p-3 text-[13px] leading-snug text-slate-300">
                    <span className="num mr-1.5 text-[11px] font-bold text-brand-400">{String(i + 1).padStart(2, "0")}</span>
                    {insight}
                  </li>
                ))}
              </ul>
              <div className="mt-4 text-[10.5px] uppercase tracking-wider text-slate-500">Generated just now</div>
            </div>
          </GlassCard>

          {/* ─ Hero KPI grid ─ */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiTile
              label="Gate Events"
              value={m.totalGateEvents.toLocaleString()}
              sub={<span className="text-emerald-400">every gate event verified end-to-end</span>}
              icon={<Truck className="h-4 w-4" />}
              tone="brand"
            />
            <KpiTile
              label="Unique Drivers"
              value={m.totalDrivers.toLocaleString()}
              sub={<span className="text-amber-300">{m.driversWithCases} with court records</span>}
              icon={<Users className="h-4 w-4" />}
              tone="emerald"
            />
            <KpiTile
              label="Risk Categories Surfaced"
              value={highRisk.toLocaleString()}
              icon={<AlertTriangle className="h-4 w-4" />}
              tone="amber"
            >
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between"><span className="text-slate-300">Invalid DL</span>     <span className="num font-mono font-semibold text-red-300">{m.invalidDl}</span></div>
                <div className="flex items-center justify-between"><span className="text-slate-300">Expired DL</span>     <span className="num font-mono font-semibold text-amber-300">{m.dlExpired}</span></div>
                <div className="flex items-center justify-between"><span className="text-slate-300">Court records</span>  <span className="num font-mono font-semibold text-amber-300">{m.driversWithCases}</span></div>
                <div className="mt-2 border-t border-white/5 pt-2 text-[10px] text-slate-500">
                  Of {m.totalDrivers.toLocaleString()} screened · <span className="num">{((highRisk / m.totalDrivers) * 100).toFixed(1)}</span>% of driver pool
                </div>
              </div>
            </KpiTile>
            <KpiTile
              label="High-Risk Entries"
              value={highRisk.toLocaleString()}
              sub="flagged for review under Fraudcheck risk rules"
              icon={<ShieldAlert className="h-4 w-4" />}
              tone="red"
              glow
            />
          </div>

          {/* ─ Mini stats ─ */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            <MiniStat label="Valid Unique Licenses" value={m.totalDrivers - m.invalidDl - m.dlExpired} total={m.totalDrivers} tone="emerald" />
            <MiniStat label="Invalid DLs" value={m.invalidDl} tone="red" sub="entry errors / fake DLs" />
            <MiniStat label="Expired DLs" value={m.dlExpired} tone="amber" sub="genuine compliance breach" />
            <MiniStat label="Court-Record Flags" value={m.driversWithCases} tone="amber" />
            <MiniStat label="Open Alerts" value={m.openAlertsCount} tone="red" sub={`${m.criticalAlerts} critical · ${m.openAlertsCount - m.criticalAlerts} other`} />
          </div>

          {/* ─ Capability banner ─ */}
          <GlassCard strong glow="emerald" className="border border-emerald-500/25 p-5">
            <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300"><BadgeCheck className="h-6 w-6" /></div>
                <div>
                  <Chip tone="emerald" dot>Capability in production</Chip>
                  <h3 className="mt-2 text-lg font-semibold tracking-tight text-white">DL scan-and-verify at gate</h3>
                  <p className="mt-1 max-w-2xl text-sm text-slate-300">Every entry runs through the DL OCR + central-registry check. Manual keying is replaced by a single scan, reducing entry errors and ensuring every event lands in the immutable audit log.</p>
                </div>
              </div>
              <button className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:border-emerald-400 hover:text-white">
                See gate events <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </GlassCard>
        </div>
      )}

      {active === "trucks" && (
        <div className="space-y-6">
          <SectionHeader
            chip={<Chip tone="brand">02 · Gate Throughput</Chip>}
            title="Truck Movement & Flow"
            subtitle="14-day entry/exit pattern and dwell-time distribution at the gate."
          />

          <div className="grid gap-4 md:grid-cols-3">
            <IssueCard tone="red"   label="Invalid DL"               value={m.invalidDl}        hint="DL number did not match the central registry — each case needs manual review." actionLabel="Fix: DL scan + auto-verify at gate" />
            <IssueCard tone="amber" label="Transport DL Expired"     value={m.dlExpired}        hint="Transport endorsement expired (6) or personal-only DL only (6)."                actionLabel="Fix: contractor renewal SLA + amber alerts" />
            <IssueCard tone="red"   label="Drivers with Court Cases" value={m.driversWithCases} hint={`${m.totalCases} total cases · ${m.activeCriminal} active criminal · ${m.civil} civil.`} actionLabel="Action: immediate review for high-risk drivers" glow />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <GlassCard className="p-5 lg:col-span-2">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-[10.5px] uppercase tracking-wider text-slate-400">Daily Entry vs Exit</div>
                  <h3 className="mt-1 text-lg font-semibold tracking-tight text-white">14-day POC flow</h3>
                </div>
                <Chip tone="emerald">+18% efficiency</Chip>
              </div>
              <LineChart labels={flowSeries.labels} series={flowSeries.series} height={220} />
              <div className="mt-2 flex items-center gap-4 text-[11.5px] text-slate-400">
                <Legend color={INSIGHTS_PALETTE.brand}   label="Entries" />
                <Legend color={INSIGHTS_PALETTE.emerald} label="Exits"   />
              </div>
            </GlassCard>

            <GlassCard className="p-5">
              <div className="mb-3">
                <div className="text-[10.5px] uppercase tracking-wider text-slate-400">Gate-to-Exit Duration</div>
                <h3 className="mt-1 text-lg font-semibold tracking-tight text-white">{m.dwell.sampleCount} truck dwell times measured</h3>
              </div>
              <div className="flex flex-col items-center gap-4">
                <Donut slices={dwellDonut} size={200} thickness={28}
                       centerLabel={<span>{Math.round(m.dwell.avgMinutes / 60)}h</span>} centerSub="Avg dwell" />
                <div className="grid w-full grid-cols-2 gap-2 text-center text-[11.5px]">
                  <div className="rounded-lg border border-white/8 bg-white/[.03] p-2">
                    <div className="num font-semibold text-white">{m.dwell.avgMinutes}m</div>
                    <div className="text-slate-400">Avg dwell</div>
                  </div>
                  <div className="rounded-lg border border-white/8 bg-white/[.03] p-2">
                    <div className="num font-semibold text-white">{m.dwell.p95Minutes}m</div>
                    <div className="text-slate-400">p95 dwell</div>
                  </div>
                </div>
                <div className="grid w-full grid-cols-1 gap-1 text-[10.5px] text-slate-400">
                  {dwellDonut.map((s) => (
                    <div key={s.label} className="flex items-center justify-between">
                      <Legend color={s.color} label={s.label} />
                      <span className="num">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </GlassCard>
          </div>

          <GlassCard className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-tight text-white">Dwell distribution</h3>
              <Chip>{m.dwell.sampleCount} trucks</Chip>
            </div>
            <Histogram bins={m.dwell.bins} height={160} />
          </GlassCard>
        </div>
      )}

      {active === "providers" && (
        <div className="space-y-6">
          <SectionHeader
            chip={<Chip tone="brand">03 · Service Providers</Chip>}
            title="Provider Intelligence"
            subtitle="Volume concentration and risk ranking across the transport service providers carrying your freight."
          />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MiniStat label="Unique Providers"        value={m.spRisk.length}                                         tone="brand"   sub="named in dataset" />
            <MiniStat label="Total Truck Visits"      value={m.spVolume.reduce((s, x) => s + x.trucks, 0)}            tone="emerald" sub="last 30 days" />
            <MiniStat label="Providers w/ Flags"      value={m.spRisk.filter((s) => s.total > 0).length}              tone="amber"   />
            <MiniStat label="Critical-Risk Providers" value={m.spRisk.filter((s) => s.activeCriminal > 0).length}     tone="red"     sub="active criminal cases" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <GlassCard className="p-5">
              <div className="mb-3">
                <div className="text-[10.5px] uppercase tracking-wider text-slate-400">Volume Concentration</div>
                <h3 className="mt-1 text-lg font-semibold tracking-tight text-white">Top 5 providers · 90% of volume</h3>
              </div>
              <div className="flex flex-col items-center gap-4">
                <Donut slices={spDonut} size={200} thickness={28} centerLabel={<span>{m.spVolume.length}</span>} centerSub="Providers" />
                <div className="grid w-full grid-cols-1 gap-1 text-[10.5px] text-slate-400">
                  {spDonut.map((s) => (
                    <div key={s.label} className="flex items-center justify-between">
                      <Legend color={s.color} label={s.label.length > 28 ? `${s.label.slice(0, 28)}…` : s.label} />
                      <span className="num">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </GlassCard>

            <GlassCard className="p-5 lg:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-[10.5px] uppercase tracking-wider text-slate-400">Top 10 Providers · Risk-ranked</div>
                  <h3 className="mt-1 text-lg font-semibold tracking-tight text-white">Court records · DL hygiene · risk tier</h3>
                </div>
                <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-brand-300">
                  All providers <ArrowRight className="h-3 w-3" />
                </span>
              </div>
              <ProviderRiskTable rows={m.spRisk} />
            </GlassCard>
          </div>
        </div>
      )}

      {active === "drivers" && (
        <div className="space-y-6">
          <SectionHeader
            chip={<Chip tone="brand">04 · Driver Intelligence</Chip>}
            title="Driver Intelligence"
            subtitle="Every driver attached to a service provider — court flags, DL hygiene, and renewal pressure."
          />

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiTile label="Drivers Tracked"       value={m.totalDrivers.toLocaleString()} sub="unique DLs in driver pool" icon={<Users className="h-4 w-4" />} tone="brand" />
            <KpiTile label="Court Records Found"   value={m.totalCases}                    sub={`${m.criminal} criminal · ${m.civil} civil`} icon={<FileSearch className="h-4 w-4" />} tone="amber" />
            <KpiTile label="Active Criminal Cases" value={m.activeCriminal}                sub="cases currently open"   icon={<AlertCircle className="h-4 w-4" />} tone="red" glow />
            <KpiTile label="DL Expiring ≤30d"      value={m.dlExpiring30}                  sub="renew before next inbound" icon={<Clock className="h-4 w-4" />} tone="amber" />
          </div>

          <GlassCard className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-tight text-white">Open alerts by type</h3>
              <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-brand-300">View all <ArrowRight className="h-3 w-3" /></span>
            </div>
            <div className="grid gap-2">
              {m.alertsByType.map((a) => {
                const total = m.alertsByType.reduce((s, x) => s + x.count, 0);
                const pct = (a.count / total) * 100;
                return (
                  <div key={a.type}>
                    <div className="mb-1 flex items-center justify-between text-[12px]">
                      <Legend color={a.color} label={a.label} />
                      <span className="num text-slate-300">{a.count} <span className="text-slate-500">({pct.toFixed(0)}%)</span></span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: a.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassCard>

          <GlassCard className="p-0" glow="red">
            <div className="border-b border-white/8 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <Chip tone="red" dot>Flagged for action</Chip>
                  <h3 className="mt-2 text-lg font-semibold tracking-tight text-white">Drivers requiring urgent DL action</h3>
                  <p className="mt-1 text-[12.5px] text-slate-400">{m.urgentList.length} drivers with expired or near-expiring DLs.</p>
                </div>
              </div>
            </div>
            <UrgentDriversTable rows={m.urgentList} />
          </GlassCard>

          <div className="grid gap-3 md:grid-cols-4">
            {[
              { label: "Driver registry",   icon: Users },
              { label: "Service providers", icon: TrendingUp },
              { label: "Gate event log",    icon: Truck },
              { label: "Alerts",            icon: AlertTriangle },
            ].map((item) => (
              <div key={item.label} className="group flex items-center gap-3 rounded-xl border border-white/8 bg-white/[.03] px-4 py-3.5 transition hover:-translate-y-0.5 hover:border-brand-400/40 hover:bg-white/[.06]">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-slate-300 group-hover:text-white"><item.icon className="h-4 w-4" /></div>
                <span className="text-[13px] font-medium text-slate-200 group-hover:text-white">{item.label}</span>
                <ArrowRight className="ml-auto h-3.5 w-3.5 text-slate-500 transition group-hover:text-brand-300" />
              </div>
            ))}
          </div>
        </div>
      )}
    </InsightsShell>
  );
}

/* ── helpers (local) ────────────────────────────────────────────────────── */

function IssueCard({
  tone, label, value, hint, actionLabel, glow,
}: {
  tone: "red" | "amber"; label: string; value: number; hint: string; actionLabel: string; glow?: boolean;
}) {
  const valueColor = tone === "red" ? "text-red-300" : "text-amber-300";
  const chipTone   = tone === "red" ? "red" : "amber";
  return (
    <GlassCard className="p-5" glow={glow ? "red" : undefined}>
      <div className="text-[10.5px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className={cx("num mt-2 text-3xl font-bold", valueColor)}>{value}</div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-slate-300">{hint}</p>
      <div className="mt-3"><Chip tone={chipTone}>{actionLabel}</Chip></div>
    </GlassCard>
  );
}

function ProviderRiskTable({ rows }: {
  rows: Array<{
    spId: string; spName: string; total: number; criminal: number; civil: number;
    activeCriminal: number; dlExpired: number; noTransportDl: number; invalidDl: number;
  }>;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/8">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="border-b border-white/8 bg-white/[.04] text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
            <th className="px-4 py-3">Provider</th>
            <th className="px-3 py-3 text-right">Court</th>
            <th className="px-3 py-3 text-right">Non-Transport</th>
            <th className="px-3 py-3 text-right">Expired DL</th>
            <th className="px-3 py-3 text-right">Invalid DL</th>
            <th className="px-3 py-3 text-right">Total Flags</th>
            <th className="px-3 py-3 text-right">Risk</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((sp, i) => {
            const tier: "critical" | "high" | "medium" | "low" =
              sp.activeCriminal > 0 ? "critical" :
              sp.total >= 10        ? "high" :
              sp.total >= 3         ? "medium" :
              sp.total >= 1         ? "medium" : "low";
            return (
              <tr key={sp.spId} className={cx("border-b border-white/5 transition hover:bg-white/[.04]", i === rows.length - 1 && "border-b-0")}>
                <td className="px-4 py-3 font-medium text-white">{sp.spName}</td>
                <td className={cx("num px-3 py-3 text-right", sp.criminal > 0 ? "font-semibold text-red-300" : "text-slate-500")}>{sp.criminal}</td>
                <td className={cx("num px-3 py-3 text-right", sp.noTransportDl > 0 ? "font-semibold text-amber-300" : "text-slate-500")}>{sp.noTransportDl}</td>
                <td className={cx("num px-3 py-3 text-right", sp.dlExpired > 0 ? "font-semibold text-amber-300" : "text-slate-500")}>{sp.dlExpired}</td>
                <td className={cx("num px-3 py-3 text-right", sp.invalidDl > 0 ? "font-semibold text-amber-300" : "text-slate-500")}>{sp.invalidDl}</td>
                <td className={cx("num px-3 py-3 text-right font-semibold", sp.total >= 10 ? "text-red-300" : sp.total >= 3 ? "text-amber-300" : "text-slate-200")}>{sp.total}</td>
                <td className="px-3 py-3 text-right"><RiskBadge tier={tier} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function UrgentDriversTable({
  rows,
}: {
  rows: Array<{ id: string; name: string; dlNumber: string; dlExpiryMs: number; dlStatus: string; bgStatus: string }>;
}) {
  // Cache "now" once at render so the table is stable.
  const now = Date.now();
  return (
    <div className="overflow-hidden">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="border-b border-white/8 bg-white/[.04] text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
            <th className="px-5 py-3">Driver</th>
            <th className="px-3 py-3">DL Number</th>
            <th className="px-3 py-3">DL Status</th>
            <th className="px-3 py-3">BG Status</th>
            <th className="px-3 py-3 text-right">Days to expiry</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d, i) => {
            const daysLeft = Math.round((d.dlExpiryMs - now) / 86400000);
            const isExpired = daysLeft < 0;
            return (
              <tr key={d.id} className={cx("border-b border-white/5 transition hover:bg-white/[.04]", i === rows.length - 1 && "border-b-0")}>
                <td className="px-5 py-3 font-medium text-white">{d.name}</td>
                <td className="num px-3 py-3 text-slate-300">{d.dlNumber}</td>
                <td className="px-3 py-3"><Chip tone={d.dlStatus === "valid" ? "emerald" : "red"}>{d.dlStatus}</Chip></td>
                <td className="px-3 py-3"><Chip tone={d.bgStatus === "clear" ? "emerald" : d.bgStatus === "flagged" ? "red" : "default"}>{d.bgStatus}</Chip></td>
                <td className={cx("num px-3 py-3 text-right font-semibold", isExpired ? "text-red-300" : "text-amber-300")}>
                  {isExpired ? `${Math.abs(daysLeft)} d expired` : `${daysLeft} d`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      <span className="text-slate-300">{label}</span>
    </span>
  );
}
