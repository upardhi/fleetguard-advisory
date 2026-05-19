"use client";

import { useEffect, useState } from "react";
import { Bell, Calendar, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "./Badge";
import { ProfileMenu } from "./ProfileMenu";
import { useSidebarContext } from "../_contexts/SidebarContext";

type Props = {
  warehouse?: string;
  breadcrumbs?: { label: string; href?: string }[];
  alertCount?: number;
  hideSearch?: boolean;
  alertsHref?: string;
  /** Advisory-style header: rendered instead of breadcrumbs */
  title?: string;
  subtitle?: string;
};

export function TopBar({ warehouse, breadcrumbs, alertCount, hideSearch, alertsHref, title, subtitle }: Props) {
  const [now, setNow] = useState<Date | null>(null);
  const [liveCount, setLiveCount] = useState<number>(alertCount ?? 0);
  const sidebar = useSidebarContext();
  const pathname = usePathname();

  // Guard portal has no alerts page — render the bell as a static button
  // even if a caller still passes alertsHref (legacy prop, no longer used).
  const isGuardPath = pathname?.startsWith("/guard") ?? false;
  const resolvedAlertsHref = isGuardPath ? undefined : (alertsHref ?? deriveAlertsHref(pathname));

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Poll open alerts every 30s for the live counter. Guards get an empty array
  // back from the API so this naturally stays at 0 for their portal.
  useEffect(() => {
    if (!resolvedAlertsHref || resolvedAlertsHref.startsWith("/guard")) return;
    let cancelled = false;
    async function tick() {
      try {
        const res = await fetch("/api/v2/alerts?status=open&limit=2000", { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as { alerts?: Array<unknown> };
        if (!cancelled) setLiveCount(data.alerts?.length ?? 0);
      } catch { /* keep last known */ }
    }
    tick();
    const id = setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [resolvedAlertsHref]);

  // Caller-provided count wins if explicitly set; otherwise use the live poll.
  const displayCount = alertCount ?? liveCount;

  return (
    <div className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div className="flex items-center gap-3">
        {sidebar && (
          <button
            type="button"
            onClick={sidebar.toggle}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Toggle navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <div className="flex items-center gap-6">
          {title && (
            <div>
              <h1 className="text-sm font-semibold text-slate-900 leading-tight">{title}</h1>
              {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
            </div>
          )}
          {!title && breadcrumbs && breadcrumbs.length > 0 && (
            <nav className="flex items-center gap-2 text-[12.5px] text-slate-500">
              {breadcrumbs.map((b, i) => (
                <span key={i} className="flex items-center gap-2">
                  {i > 0 && <span className="text-slate-300">/</span>}
                  {b.href ? (
                    <a href={b.href} className="hover:text-slate-900">
                      {b.label}
                    </a>
                  ) : (
                    <span
                      className={i === breadcrumbs.length - 1 ? "font-medium text-slate-900" : ""}
                    >
                      {b.label}
                    </span>
                  )}
                </span>
              ))}
            </nav>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Search */}
        {/* {!hideSearch && (
          <div className="hidden items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-[12.5px] text-slate-500 sm:flex">
            <Search className="h-3.5 w-3.5" />
            <span>Search truck, driver, trip, alert…</span>
            <kbd className="ml-6 rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
              ⌘K
            </kbd>
          </div>
        )} */}

        {/* Warehouse pill */}
        {warehouse && (
          <Badge tone="brand" dot>
            {warehouse}
          </Badge>
        )}

        {/* Time */}
        <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-600">
          <Calendar className="h-3.5 w-3.5" />
          <span className="num">
            {now ? now.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"}
          </span>
          <span className="text-slate-300">·</span>
          <span className="num">
            {now
              ? now.toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                })
              : "—"}
          </span>
        </div>

        {/* Alerts bell */}
        {resolvedAlertsHref ? (
          <Link
            href={resolvedAlertsHref}
            className="relative grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            title={displayCount > 0 ? `${displayCount} open alert${displayCount !== 1 ? "s" : ""}` : "Alerts"}
          >
            <Bell className={`h-4 w-4 ${displayCount > 0 ? "text-danger-600" : ""}`} />
            {displayCount > 0 && (
              <span className="num absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-600 px-1 text-[9px] font-bold text-white shadow-sm">
                {displayCount > 99 ? "99+" : displayCount}
              </span>
            )}
          </Link>
        ) : (
          <button
            type="button"
            className="relative grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            title={displayCount > 0 ? `${displayCount} open alert${displayCount !== 1 ? "s" : ""}` : "Alerts"}
          >
            <Bell className={`h-4 w-4 ${displayCount > 0 ? "text-danger-600" : ""}`} />
            {displayCount > 0 && (
              <span className="num absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-600 px-1 text-[9px] font-bold text-white shadow-sm">
                {displayCount > 99 ? "99+" : displayCount}
              </span>
            )}
          </button>
        )}

        {/* Profile dropdown */}
        <ProfileMenu />
      </div>
    </div>
  );
}

function deriveAlertsHref(pathname: string | null): string | undefined {
  if (!pathname) return undefined;
  if (pathname.startsWith("/manager")) return "/manager/alerts";
  if (pathname.startsWith("/cso")) return "/cso/alerts";
  // Guard portal intentionally has no alerts page.
  return undefined;
}
