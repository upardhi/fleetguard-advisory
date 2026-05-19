"use client";

/**
 * Top-bar pill that shows the open-alert count for the current user's scope.
 * Polls every 30s. Click → navigates to the role's alerts page.
 *
 * Manager and CSO see real counts; guards see nothing (the API returns
 * `{ alerts: [] }` for guards, so the pill stays at 0 → hidden).
 */

import Link from "next/link";
import { Bell } from "lucide-react";
import { useEffect, useState } from "react";

const POLL_MS = 30_000;

export function AlertsCounterPill({ href }: { href: string }) {
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const res = await fetch("/api/v2/alerts?status=open&limit=2000", {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { alerts?: Array<{ id: string }> };
        if (!cancelled) setCount(data.alerts?.length ?? 0);
      } catch {
        /* swallow — pill stays at last known value */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (loading || count === 0) {
    return (
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-[12px] font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-100"
      >
        <Bell className="h-3.5 w-3.5" />
        <span>Alerts</span>
      </Link>
    );
  }

  const tone = count >= 10 ? "danger" : count >= 3 ? "warning" : "ok";
  const cls =
    tone === "danger"  ? "bg-danger-50  text-danger-700  ring-danger-200  hover:bg-danger-100"
    : tone === "warning" ? "bg-warning-50 text-warning-700 ring-warning-200 hover:bg-warning-100"
                         : "bg-brand-50  text-brand-700  ring-brand-200  hover:bg-brand-100";

  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 transition ${cls}`}
    >
      <Bell className="h-3.5 w-3.5" />
      <span className="num">{count}</span>
      <span>open</span>
    </Link>
  );
}
