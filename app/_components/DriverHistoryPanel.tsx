"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Ban,
  Calendar,
  Clock4,
  ShieldCheck,
  Truck,
  UserRound,
  X,
} from "lucide-react";
import { cx, fmtAgo } from "../_lib/utils";
import { Badge } from "./Badge";
import { SlidePanel } from "./SlidePanel";
import type { FgDriver } from "../_services/driverService";
import type { FgGateEvent } from "../_services/gateEventService";
import { getGateEventsByDriver } from "../_services/gateEventService";
import type { GateEventType } from "../_lib/types";

// Every gate-event type in the system ends in either `_entry` or `_exit` —
// keying off the suffix automatically handles visitor_*, contractor_*,
// inbound_*, outbound_* without us having to maintain an ever-growing list.
function isEntryEvent(t: GateEventType): boolean {
  return t.endsWith("_entry");
}
function isExitEvent(t: GateEventType): boolean {
  return t.endsWith("_exit");
}

/** Format a Date as "21 Apr 2026 · 14:32". */
function fmtDateTime(d: Date): string {
  const date = d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${date} · ${time}`;
}

/** Format a Date as just "14:32". */
function fmtTimeShort(d: Date): string {
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Convert a Date to "YYYY-MM-DD" for the <input type="date"> element. */
function toDateInputValue(d: Date | null): string {
  if (!d) return "";
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Format a span like "2h 14m" / "47m" / "3d 5h". */
function fmtDuration(ms: number): string {
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s`;
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// ── Visit pairing ────────────────────────────────────────────────────────────
//
// A "visit" is one entry plus its matching exit. Walking the events in
// chronological order, every entry opens a visit; the next exit (for the
// same driver) closes it. An entry that hasn't been closed yet is "Still
// inside". A denied entry is rendered as its own one-row card.

type Visit =
  | { kind: "visit"; id: string; entry: FgGateEvent; exit: FgGateEvent | null }
  | { kind: "denied"; id: string; entry: FgGateEvent }
  | { kind: "orphan_exit"; id: string; exit: FgGateEvent };

function pairVisits(events: FgGateEvent[]): Visit[] {
  // Defensive sort ascending — pairing relies on chronological order.
  const asc = [...events].sort((a, b) => a.time.getTime() - b.time.getTime());
  const out: Visit[] = [];
  let openEntry: FgGateEvent | null = null;
  for (const ev of asc) {
    if (ev.status === "denied") {
      out.push({ kind: "denied", id: ev.id, entry: ev });
      continue;
    }
    if (isEntryEvent(ev.eventType)) {
      // If we already had an open entry, the previous one never matched up
      // with an exit — flush it as still-inside before opening this one.
      if (openEntry) {
        out.push({ kind: "visit", id: openEntry.id, entry: openEntry, exit: null });
      }
      openEntry = ev;
    } else if (isExitEvent(ev.eventType)) {
      if (openEntry) {
        out.push({ kind: "visit", id: openEntry.id, entry: openEntry, exit: ev });
        openEntry = null;
      } else {
        // Exit without a recorded entry — surface so it isn't silently dropped.
        out.push({ kind: "orphan_exit", id: ev.id, exit: ev });
      }
    }
  }
  if (openEntry) {
    out.push({ kind: "visit", id: openEntry.id, entry: openEntry, exit: null });
  }
  // Newest visit first.
  return out.reverse();
}

export function DriverHistoryPanel({
  driver,
  onClose,
}: {
  driver: FgDriver;
  onClose: () => void;
}) {
  const [events, setEvents] = useState<FgGateEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Date-range filter (inclusive). Empty string = no boundary on that side.
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    getGateEventsByDriver(driver.id, 200)
      .then((rows) => {
        if (!cancelled) setEvents(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load history");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [driver.id]);

  const filtered = useMemo(() => {
    if (!events) return null;
    const fromMs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    // Inclusive end-of-day so selecting the same from/to shows that day's events.
    const toMs = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : null;
    return events.filter((ev) => {
      const t = ev.time.getTime();
      if (fromMs !== null && t < fromMs) return false;
      if (toMs !== null && t > toMs) return false;
      return true;
    });
  }, [events, fromDate, toDate]);

  const visits = useMemo(() => (filtered ? pairVisits(filtered) : null), [filtered]);

  const counts = useMemo(() => {
    const list = visits ?? [];
    let completed = 0;
    let stillInside = 0;
    let denied = 0;
    for (const v of list) {
      if (v.kind === "denied") denied++;
      else if (v.kind === "visit" && v.exit) completed++;
      else if (v.kind === "visit" && !v.exit) stillInside++;
    }
    return { completed, stillInside, denied };
  }, [visits]);

  const clearFilters = () => {
    setFromDate("");
    setToDate("");
  };
  const hasFilter = !!fromDate || !!toDate;

  return (
    <SlidePanel
      open
      onClose={onClose}
      title="Driver gate history"
      subtitle={`${driver.fullName} · ${driver.dlNumber}`}
      width="lg"
    >
      <div className="space-y-5">
        {/* Date range picker */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
            <Calendar className="h-3 w-3" />
            Filter by date
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-600">
              From
              <input
                type="date"
                value={fromDate}
                max={toDate || toDateInputValue(new Date())}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-[12.5px] focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-600">
              To
              <input
                type="date"
                value={toDate}
                min={fromDate || undefined}
                max={toDateInputValue(new Date())}
                onChange={(e) => setToDate(e.target.value)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-[12.5px] focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
              />
            </label>
            {hasFilter && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-[12px] font-medium text-slate-500 hover:text-slate-800"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Summary counters */}
        {visits !== null && (visits.length > 0 || hasFilter) && (
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Completed visits" value={counts.completed} tone="success" icon={ArrowUpRight} />
            <Stat label="Still inside" value={counts.stillInside} tone="info" icon={ArrowDownRight} />
            <Stat label="Denied" value={counts.denied} tone="danger" icon={Ban} />
          </div>
        )}

        {/* Body */}
        {error ? (
          <div className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-[13px] text-danger-700">
            {error}
          </div>
        ) : visits === null ? (
          <div className="py-10 text-center text-[13px] text-slate-500">Loading history…</div>
        ) : visits.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center text-[13px] text-slate-500">
            {events && events.length === 0
              ? "No gate events recorded for this driver yet."
              : "No events in the selected date range."}
          </div>
        ) : (
          <ol className="space-y-4">
            {visits.map((v, i) => {
              // Visit number = total visits − reverse index, so the newest
              // visit at the top has the highest number (matches a manager's
              // mental model of "this is the latest").
              const visitNo = visits.length - i;
              if (v.kind === "denied") {
                return <DeniedCard key={v.id} ev={v.entry} visitNo={visitNo} />;
              }
              if (v.kind === "orphan_exit") {
                return <OrphanExitCard key={v.id} ev={v.exit} visitNo={visitNo} />;
              }
              return <VisitCard key={v.id} entry={v.entry} exit={v.exit} visitNo={visitNo} />;
            })}
          </ol>
        )}
      </div>
    </SlidePanel>
  );
}

function Stat({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: "success" | "info" | "danger";
  icon: typeof ArrowDownRight;
}) {
  return (
    <div
      className={cx(
        "rounded-xl border p-3",
        tone === "success" && "border-success-200 bg-success-50/60",
        tone === "info" && "border-sky-200 bg-sky-50/60",
        tone === "danger" && "border-danger-200 bg-danger-50/60",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </span>
        <Icon
          className={cx(
            "h-3.5 w-3.5",
            tone === "success" && "text-success-600",
            tone === "info" && "text-sky-600",
            tone === "danger" && "text-danger-600",
          )}
        />
      </div>
      <div
        className={cx(
          "num mt-1 text-[20px] font-bold",
          tone === "success" && "text-success-700",
          tone === "info" && "text-sky-700",
          tone === "danger" && "text-danger-700",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof ShieldCheck;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="h-3 w-3 shrink-0 text-slate-400" />
      <span className="text-slate-400">{label}:</span>
      <span className="truncate text-slate-800">{children}</span>
    </div>
  );
}

// ── Visit cards ──────────────────────────────────────────────────────────────

function VisitNumber({ n }: { n: number }) {
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-100 px-1.5 text-[10.5px] font-bold text-slate-600 ring-1 ring-slate-200">
      #{n}
    </span>
  );
}

function VisitCard({
  entry,
  exit,
  visitNo,
}: {
  entry: FgGateEvent;
  exit: FgGateEvent | null;
  visitNo: number;
}) {
  const open = exit === null;
  const duration = exit ? fmtDuration(exit.time.getTime() - entry.time.getTime()) : null;
  const sameDay =
    exit !== null &&
    entry.time.toDateString() === exit.time.toDateString();
  return (
    <li className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {/* Header — visit # + date + duration / status */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-3 py-2">
        <VisitNumber n={visitNo} />
        <span className="text-[12px] font-semibold text-slate-700">
          {entry.time.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
        </span>
        {open ? (
          <Badge tone="warning" dot>Still inside</Badge>
        ) : (
          <Badge tone="success">Inside for {duration}</Badge>
        )}
        <span className="ml-auto text-[11px] text-slate-500">{fmtAgo(entry.time)}</span>
      </div>

      {/* IN row */}
      <Leg
        kind="in"
        time={entry.time}
        guardName={entry.guardName}
        vehicleReg={entry.vehicleReg}
        contractorName={entry.contractorName}
        eventType={entry.eventType}
        overrideReason={entry.overrideReason}
      />

      {/* Connector */}
      <div className="relative ml-6.5 h-4 border-l-2 border-dashed border-slate-200" aria-hidden />

      {/* OUT row */}
      {open ? (
        <div className="flex items-center gap-3 px-3 pb-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-400 ring-1 ring-dashed ring-slate-300">
            <ArrowUpRight className="h-4 w-4" />
          </div>
          <div className="flex-1 text-[12.5px] italic text-slate-500">
            No exit recorded yet — driver is still inside the warehouse.
          </div>
        </div>
      ) : (
        <Leg
          kind="out"
          time={exit.time}
          guardName={exit.guardName}
          vehicleReg={exit.vehicleReg}
          contractorName={exit.contractorName}
          eventType={exit.eventType}
          overrideReason={exit.overrideReason}
          showDateOnTime={!sameDay}
        />
      )}
    </li>
  );
}

function Leg({
  kind,
  time,
  guardName,
  vehicleReg,
  contractorName,
  eventType,
  overrideReason,
  showDateOnTime,
}: {
  kind: "in" | "out";
  time: Date;
  guardName: string | null;
  vehicleReg: string | null;
  contractorName: string | null;
  eventType: string;
  overrideReason: string | null;
  showDateOnTime?: boolean;
}) {
  const isIn = kind === "in";
  return (
    <div className="flex items-start gap-3 px-3 py-3">
      <div
        className={cx(
          "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
          isIn ? "bg-success-50 text-success-700" : "bg-sky-50 text-sky-700",
        )}
        aria-label={isIn ? "In" : "Out"}
      >
        {isIn ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cx(
              "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10.5px] font-bold tracking-[0.08em] text-white",
              isIn ? "bg-success-600" : "bg-sky-600",
            )}
          >
            {isIn ? "IN" : "OUT"}
          </span>
          <span className="font-mono text-[13px] font-semibold text-slate-900">
            {showDateOnTime ? fmtDateTime(time) : fmtTimeShort(time)}
          </span>
          {overrideReason && <Badge tone="warning">Override</Badge>}
        </div>
        <div className="mt-1.5 grid grid-cols-1 gap-y-1 text-[12px] text-slate-600 sm:grid-cols-2">
          <Field icon={ShieldCheck} label="Guard">
            {guardName || "—"}
          </Field>
          <Field icon={Truck} label="Vehicle">
            {vehicleReg || "—"}
          </Field>
          {contractorName && (
            <Field icon={UserRound} label="Contractor">
              {contractorName}
            </Field>
          )}
          <Field icon={Clock4} label="Event">
            {eventType.replace(/_/g, " ")}
          </Field>
        </div>
        {overrideReason && (
          <div className="mt-2 rounded-md border border-warning-200 bg-warning-50 px-2.5 py-1.5 text-[11.5px] text-warning-800">
            <strong className="font-semibold">Override:</strong> {overrideReason}
          </div>
        )}
      </div>
    </div>
  );
}

function DeniedCard({ ev, visitNo }: { ev: FgGateEvent; visitNo: number }) {
  return (
    <li className="overflow-hidden rounded-xl border border-danger-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-danger-100 bg-danger-50/60 px-3 py-2">
        <VisitNumber n={visitNo} />
        <span className="text-[12px] font-semibold text-danger-700">Entry denied</span>
        <span className="ml-auto text-[11px] text-slate-500">{fmtAgo(ev.time)}</span>
      </div>
      <div className="flex items-start gap-3 px-3 py-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-danger-50 text-danger-700">
          <Ban className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[13px] font-semibold text-slate-900">
            {fmtDateTime(ev.time)}
          </div>
          <div className="mt-1.5 grid grid-cols-1 gap-y-1 text-[12px] text-slate-600 sm:grid-cols-2">
            <Field icon={ShieldCheck} label="Guard">{ev.guardName || "—"}</Field>
            <Field icon={Truck} label="Vehicle">{ev.vehicleReg || "—"}</Field>
            {ev.contractorName && (
              <Field icon={UserRound} label="Contractor">{ev.contractorName}</Field>
            )}
          </div>
          {ev.overrideReason && (
            <div className="mt-2 rounded-md border border-warning-200 bg-warning-50 px-2.5 py-1.5 text-[11.5px] text-warning-800">
              <strong className="font-semibold">Reason:</strong> {ev.overrideReason}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function OrphanExitCard({ ev, visitNo }: { ev: FgGateEvent; visitNo: number }) {
  return (
    <li className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-3 py-2">
        <VisitNumber n={visitNo} />
        <Badge tone="muted">Exit only — no matching entry on record</Badge>
        <span className="ml-auto text-[11px] text-slate-500">{fmtAgo(ev.time)}</span>
      </div>
      <Leg
        kind="out"
        time={ev.time}
        guardName={ev.guardName}
        vehicleReg={ev.vehicleReg}
        contractorName={ev.contractorName}
        eventType={ev.eventType}
        overrideReason={ev.overrideReason}
        showDateOnTime
      />
    </li>
  );
}
