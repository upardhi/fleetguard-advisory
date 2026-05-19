"use client";

import { useEffect, useState } from "react";

/**
 * Live countdown chip showing elapsed-vs-SLA for an incident.
 * Re-renders every 60s. Tone shifts:
 *   < 50% → green   ("on track")
 *   50–100% → amber ("approaching SLA")
 *   100–150% → red  ("breached, RM escalated")
 *   ≥ 150% → red+pulse ("CSO escalated")
 *
 * If `slaStartAt` is in the future (non-critical incident raised outside
 * business hours), the clock hasn't started yet — show "Paused until 9am IST".
 */
export function SlaBadge({
  createdAt,
  slaStartAt,
  slaDeadline,
}: {
  createdAt:   Date | string;
  slaStartAt?: Date | string | null;
  slaDeadline: Date | string;
}) {
  const startEffective =
    slaStartAt != null
      ? (typeof slaStartAt === "string" ? new Date(slaStartAt).getTime() : slaStartAt.getTime())
      : (typeof createdAt === "string" ? new Date(createdAt).getTime() : createdAt.getTime());
  const end = typeof slaDeadline === "string" ? new Date(slaDeadline).getTime() : slaDeadline.getTime();

  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Deferred window — clock hasn't started
  if (now < startEffective) {
    const startsAt = new Date(startEffective).toLocaleString("en-IN", {
      hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
    });
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
        ⏸ Paused — starts {startsAt} IST
      </span>
    );
  }

  const span = Math.max(end - startEffective, 1);
  const elapsed = (now - startEffective) / span;
  const minsLeft = Math.round((end - now) / 60_000);
  const minsOver = Math.round((now - end) / 60_000);

  let tone: "ok" | "warn" | "danger" | "critical";
  let label: string;
  if (elapsed < 0.5) {
    tone = "ok";
    label = `${minsLeft}m left`;
  } else if (elapsed < 1) {
    tone = "warn";
    label = `${minsLeft}m left`;
  } else if (elapsed < 1.5) {
    tone = "danger";
    label = `${minsOver}m overdue`;
  } else {
    tone = "critical";
    label = `${minsOver}m overdue — CSO notified`;
  }

  const cls =
    tone === "ok"       ? "bg-success-50 text-success-700 ring-success-200"
    : tone === "warn"   ? "bg-warning-50 text-warning-700 ring-warning-200"
    : tone === "danger" ? "bg-danger-50 text-danger-700 ring-danger-200"
                        : "bg-danger-100 text-danger-800 ring-danger-300 animate-pulse";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${cls}`}>
      ⏱ {label}
    </span>
  );
}
