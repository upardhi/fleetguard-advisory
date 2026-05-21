"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthV2 } from "../_hooks/useAuthV2";
import { useAdvisory } from "../_contexts/AdvisoryContext";
import {
  Home,
  DoorOpen,
  Truck,
  RotateCcw,
  XCircle,
  UserPlus,
  ClipboardList,
  BookOpen,
  LayoutDashboard,
  Bell,
  ShieldAlert,
  Users,
  Package,
  BarChart3,
  FileText,
  UserRound,
  Command,
  Building2,
  Globe2,
  FileSearch,
  Timer,
  LifeBuoy,
  LogOut,
  UserMinus,
  ChevronDown,
  Check,
  Warehouse,
  Sparkles,
  Calendar,
  MapPin,
  Navigation,
  ListChecks,
} from "lucide-react";
import { Logo } from "./Logo";
import { Avatar } from "./Avatar";
import { cx } from "../_lib/utils";

/**
 * String-keyed icon registry.
 * Server-component parents pass icons by key so we don't cross
 * the server/client boundary with a component function.
 */
export const icons = {
  home: Home,
  doorOpen: DoorOpen,
  truck: Truck,
  rotate: RotateCcw,
  close: XCircle,
  userPlus: UserPlus,
  clipboard: ClipboardList,
  book: BookOpen,
  dashboard: LayoutDashboard,
  bell: Bell,
  shieldAlert: ShieldAlert,
  users: Users,
  package: Package,
  chart: BarChart3,
  file: FileText,
  user: UserRound,
  command: Command,
  building: Building2,
  globe: Globe2,
  fileSearch: FileSearch,
  timer: Timer,
  logOut: LogOut,
  userMinus: UserMinus,
  sparkles: Sparkles,
  calendar: Calendar,
  mapPin: MapPin,
  navigation: Navigation,
  listChecks: ListChecks,
} as const;

export type IconKey = keyof typeof icons;

export type NavItem = {
  href: string;
  label: string;
  icon: IconKey;
  badge?: string | number;
  end?: boolean;
};

type Section = {
  heading?: string;
  items: NavItem[];
};

export interface WarehouseOption {
  id: string;
  name: string;
  city: string;
  state: string;
}

type Props = {
  sections: Section[];
  user: { name: string; role: string };
  workspace: { name: string; subtitle: string };
  warehouses?: WarehouseOption[];
  selectedWarehouseId?: string;
  onWarehouseChange?: (id: string) => void;
  onClose?: () => void;
  /**
   * Hide the warehouse switcher entirely. Used for single-warehouse roles
   * (guard, wh_manager) so they can't switch or see other warehouses.
   */
  hideWarehouseSwitcher?: boolean;
  /**
   * Hide the "All warehouses / Pan-org view" entry from the switcher dropdown.
   * Used for regional_manager — they can switch between assigned warehouses but
   * never get an org-wide aggregated view.
   */
  hideAllWarehousesOption?: boolean;
};

export function Sidebar({
  sections,
  user,
  workspace,
  warehouses = [],
  selectedWarehouseId,
  onWarehouseChange,
  onClose,
  hideWarehouseSwitcher,
  hideAllWarehousesOption,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { logOut } = useAuthV2();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await logOut();
    } catch (err) {
      console.error(err);
    } finally {
      setSigningOut(false);
      router.push("/login");
    }
  }

  return (
    <aside className="radial-glow-brand flex h-screen w-[260px] shrink-0 flex-col text-slate-200">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <Logo variant="light" />
      </div>

      {/* Warehouse filter dropdown — hidden for single-warehouse roles (guard, wh_manager) */}
      {!hideWarehouseSwitcher && (
        <div className="mx-4 mt-1 mb-1">
          <WarehouseSwitcher
            warehouses={warehouses}
            selectedId={selectedWarehouseId ?? "all"}
            onSelect={onWarehouseChange ?? (() => {})}
            currentName={workspace.name}
            currentSubtitle={workspace.subtitle}
            hideAllOption={hideAllWarehousesOption}
          />
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {sections.map((section, sIdx) => (
          <div key={sIdx} className={cx(sIdx > 0 && "mt-5")}>
            {section.heading && (
              <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                {section.heading}
              </div>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = item.end
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = icons[item.icon];
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cx(
                        "group flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition-colors",
                        active
                          ? "bg-white/10 text-white shadow-[inset_2px_0_0_0_#f59e0b]"
                          : "text-slate-300 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      <Icon
                        className={cx(
                          "h-[17px] w-[17px] shrink-0 transition-colors",
                          active ? "text-accent-400" : "text-slate-400 group-hover:text-slate-200"
                        )}
                        strokeWidth={2}
                      />
                      <span className="flex-1">{item.label}</span>
                      {item.badge !== undefined && (
                        <span
                          className={cx(
                            "num rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                            active
                              ? "bg-accent-500 text-brand-950"
                              : "bg-white/10 text-slate-200 group-hover:bg-white/15"
                          )}
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Support + user */}
      <div className="border-t border-white/10 p-3">
        {/* <Link
          href="/login"
          className="mb-2 flex items-center gap-3 rounded-md px-3 py-2 text-[12.5px] text-slate-400 hover:bg-white/5 hover:text-white"
        >
          <LifeBuoy className="h-4 w-4" />
          <span>Support · 1800-10-FLEET</span>
        </Link> */}
        <div className="flex items-center gap-3 rounded-md bg-white/5 px-3 py-2.5">
          <Avatar name={user.name} size="sm" tone="brand" />
          <div className="flex-1 min-w-0">
            <div className="truncate text-[12.5px] font-semibold text-white">{user.name}</div>
            <div className="truncate text-[10.5px] text-slate-400">{user.role}</div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-60"
            title={signingOut ? "Signing out…" : "Sign out"}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

// ── Warehouse switcher dropdown ───────────────────────────────────────────────

function WarehouseSwitcher({
  warehouses,
  selectedId,
  onSelect,
  currentName,
  currentSubtitle,
  hideAllOption,
}: {
  warehouses: WarehouseOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  currentName: string;
  currentSubtitle: string;
  hideAllOption?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selected = selectedId === "all" ? null : warehouses.find((w) => w.id === selectedId) ?? null;
  const displayName = selected ? selected.name : (warehouses.length === 0 ? currentName : "All warehouses");
  const displaySub  = selected ? `${selected.city}, ${selected.state}` : currentSubtitle || "Pan-org view";

  // Single warehouse — show static info, no dropdown
  if (warehouses.length <= 1) {
    return (
      <div className="mb-3 flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-accent-500/15 text-accent-300">
          <Warehouse className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-white">{displayName}</div>
          <div className="truncate text-[11px] text-slate-400">{displaySub}</div>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative mb-3">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-left transition hover:bg-white/10"
      >
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-accent-500/15 text-accent-300">
          <Warehouse className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-white">{displayName}</div>
          <div className="truncate text-[11px] text-slate-400">{displaySub}</div>
        </div>
        <ChevronDown className={cx("h-4 w-4 shrink-0 text-slate-400 transition-transform duration-150", open && "rotate-180")} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 overflow-hidden rounded-xl border border-white/15 bg-[#0f172a] shadow-2xl">
          {/* All warehouses — suppressed for roles scoped to specific warehouses (e.g. regional_manager) */}
          {!hideAllOption && (
            <button
              type="button"
              onClick={() => { onSelect("all"); setOpen(false); }}
              className={cx(
                "flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-white/10",
                selectedId === "all" && "bg-white/10"
              )}
            >
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-white/10 text-slate-300">
                <Globe2 className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-white">All warehouses</div>
                <div className="text-[11px] text-slate-400">Pan-org view</div>
              </div>
              {selectedId === "all" && <Check className="h-3.5 w-3.5 shrink-0 text-accent-400" />}
            </button>
          )}

          {/* Specific warehouses */}
          <>
            {!hideAllOption && (
              <div className="border-t border-white/10 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                Warehouses
              </div>
            )}
            {warehouses.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => { onSelect(w.id); setOpen(false); }}
                className={cx(
                  "flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-white/10",
                  selectedId === w.id && "bg-white/10"
                )}
              >
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-accent-500/15 text-accent-300">
                  <Warehouse className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-white">{w.name}</div>
                  <div className="truncate text-[11px] text-slate-400">{w.city}, {w.state}</div>
                </div>
                {selectedId === w.id && <Check className="h-3.5 w-3.5 shrink-0 text-accent-400" />}
              </button>
            ))}
          </>
        </div>
      )}
    </div>
  );
}

// ── Notification Bell ─────────────────────────────────────────────────────────

interface AdvisoryNotification {
  id: string;
  title: string;
  body: string | null;
  risk_level: string | null;
  category: string | null;
  region_id: string | null;
  region_label: string | null;
  region_color: string | null;
  route_id: string | null;
  is_read: boolean;
  created_at: string;
}

function riskDot(level: string | null) {
  if (level === "critical") return "bg-red-500";
  if (level === "high") return "bg-orange-500";
  if (level === "medium") return "bg-yellow-500";
  return "bg-slate-400";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function NotificationBell() {
  const [open, setOpen]             = useState(false);
  const [notifications, setNotifs]  = useState<AdvisoryNotification[]>([]);
  const [unread, setUnread]         = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/advisory/v1/notifications", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json() as { notifications: AdvisoryNotification[]; unreadCount: number };
      setNotifs(data.notifications);
      setUnread(data.unreadCount);
    } catch { /* silently ignore */ }
  }, []);

  // Poll every 60 s
  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function handleOpen() {
    setOpen((v) => !v);
    if (!open && unread > 0) {
      // Mark all read optimistically
      setUnread(0);
      setNotifs((prev) => prev.map((n) => ({ ...n, is_read: true })));
      try {
        await fetch("/api/advisory/v1/notifications/read", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
      } catch { /* ignore */ }
    }
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={handleOpen}
        className="relative flex items-center justify-center h-8 w-8 rounded-md text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
        title="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute bottom-10 left-0 z-50 w-80 rounded-xl border border-white/15 bg-[#0c1a36] shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="text-[13px] font-semibold text-white flex items-center gap-2">
              <Bell className="h-3.5 w-3.5 text-accent-400" />
              Notifications
            </div>
            {notifications.some((n) => !n.is_read) && (
              <button
                className="text-[11px] text-slate-400 hover:text-white transition-colors"
                onClick={async () => {
                  setUnread(0);
                  setNotifs((p) => p.map((n) => ({ ...n, is_read: true })));
                  await fetch("/api/advisory/v1/notifications/read", {
                    method: "POST", credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({}),
                  });
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-white/5">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-[13px] text-slate-500">
                No notifications yet
              </div>
            ) : (
              notifications.slice(0, 20).map((n) => {
                const href = n.route_id
                  ? `/advisory/planned/${n.route_id}`
                  : n.region_id
                  ? `/advisory/regions/${n.region_id}`
                  : "/advisory/regions";
                return (
                  <Link
                    key={n.id}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={cx(
                      "flex gap-3 px-4 py-3 hover:bg-white/5 transition-colors",
                      !n.is_read && "bg-white/[0.04]"
                    )}
                  >
                    {/* Risk dot */}
                    <div className="flex-shrink-0 mt-1">
                      <span className={cx("inline-block h-2 w-2 rounded-full", riskDot(n.risk_level))} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={cx("text-[12.5px] leading-snug", n.is_read ? "text-slate-300" : "text-white font-medium")}>
                        {n.title}
                      </div>
                      {n.body && (
                        <div className="mt-0.5 text-[11.5px] text-slate-500 line-clamp-2">
                          {n.body}
                        </div>
                      )}
                      <div className="mt-1 flex items-center gap-2">
                        {n.region_label && (
                          <span className="text-[10px] text-slate-500">
                            {n.region_label}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-600">
                          {timeAgo(n.created_at)}
                        </span>
                      </div>
                    </div>
                    {!n.is_read && (
                      <div className="flex-shrink-0 mt-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-accent-400 inline-block" />
                      </div>
                    )}
                  </Link>
                );
              })
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-white/10 px-4 py-2.5 text-center">
              <Link
                href="/advisory/regions"
                onClick={() => setOpen(false)}
                className="text-[11.5px] text-accent-400 hover:text-accent-300 transition-colors"
              >
                View all regions →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Advisory platform default Sidebar ────────────────────────────
// Used by app/advisory/layout.tsx — reads context so no props needed.

const ADVISORY_NAV: Section[] = [
  {
    items: [
      { href: "/advisory",         label: "Control Tower",    icon: "dashboard", end: true },
      { href: "/advisory/regions", label: "Regions & Cities", icon: "mapPin"               },
    ],
  },
  {
    heading: "Corridors",
    items: [
      { href: "/advisory/planned",      label: "Watched Corridors", icon: "listChecks" },
      { href: "/advisory/disruptions",  label: "Disruptions",       icon: "shieldAlert" },
      { href: "/advisory/events",       label: "Fleet Events",      icon: "calendar"   },
    ],
  },
  {
    heading: "Intelligence",
    items: [
      { href: "/advisory/advisories",     label: "AI Advisories",  icon: "sparkles" },
      { href: "/advisory/route-analysis", label: "Route Analysis", icon: "truck"    },
      { href: "/advisory/map",            label: "Risk Map",       icon: "globe"    },
    ],
  },
  {
    heading: "Account",
    items: [
      { href: "/advisory/profile",  label: "My Profile", icon: "user"  },
      { href: "/advisory/team",     label: "Team",       icon: "users" },
      { href: "/advisory/settings", label: "Settings",   icon: "file"  },
    ],
  },
];

export default function AdvisorySidebar() {
  const { user, warehouses, selectedWarehouse, selectWarehouse } = useAdvisory();
  const router = useRouter();
  const { logOut } = useAuthV2();
  const [signingOut, setSigningOut] = useState(false);

  const warehouseOptions: WarehouseOption[] = warehouses.map((w) => ({
    id: w.id, name: w.name, city: w.city, state: w.state,
  }));

  function handleWarehouseChange(id: string) {
    const w = warehouses.find((wh) => wh.id === id);
    if (w) selectWarehouse(w);
  }

  async function handleSignOut() {
    setSigningOut(true);
    try { await logOut(); } catch { /* ignore */ }
    setSigningOut(false);
    router.push("/login");
  }

  return (
    <aside className="radial-glow-brand flex h-screen w-[260px] shrink-0 flex-col text-slate-200">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <Logo variant="light" />
      </div>

      {/* Warehouse switcher */}
      <div className="mx-4 mt-1 mb-1">
        <WarehouseSwitcher
          warehouses={warehouseOptions}
          selectedId={selectedWarehouse?.id ?? "all"}
          onSelect={handleWarehouseChange}
          currentName={selectedWarehouse?.name ?? "All Warehouses"}
          currentSubtitle={
            selectedWarehouse
              ? `${selectedWarehouse.city}, ${selectedWarehouse.state}`
              : "Pan-India View"
          }
        />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {ADVISORY_NAV.map((section, sIdx) => (
          <div key={sIdx} className={cx(sIdx > 0 && "mt-5")}>
            {section.heading && (
              <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                {section.heading}
              </div>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.href}>
                  <AdvisoryNavLink href={item.href} icon={item.icon} label={item.label} badge={item.badge} end={item.end} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2 rounded-md bg-white/5 px-3 py-2.5">
          <Avatar name={user?.name ?? "—"} size="sm" tone="brand" />
          <div className="flex-1 min-w-0">
            <div className="truncate text-[12.5px] font-semibold text-white">{user?.name ?? "—"}</div>
            <div className="truncate text-[10.5px] text-slate-400">{user?.role ?? ""}</div>
          </div>
          {/* Notification bell */}
          <NotificationBell />
          {/* Sign out */}
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-60"
            title={signingOut ? "Signing out…" : "Sign out"}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

// ── Advisory nav link (active state) ─────────────────────────────────────────

function AdvisoryNavLink({
  href, icon, label, badge, end,
}: {
  href: string;
  icon: IconKey;
  label: string;
  badge?: string | number;
  end?: boolean;
}) {
  const pathname = usePathname();
  const active = end ? pathname === href : pathname === href || pathname.startsWith(href + "/");
  const Icon = icons[icon];
  return (
    <Link
      href={href}
      className={cx(
        "group flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition-colors",
        active
          ? "bg-white/10 text-white shadow-[inset_2px_0_0_0_#f59e0b]"
          : "text-slate-300 hover:bg-white/5 hover:text-white"
      )}
    >
      <Icon
        className={cx(
          "h-[17px] w-[17px] shrink-0 transition-colors",
          active ? "text-accent-400" : "text-slate-400 group-hover:text-slate-200"
        )}
        strokeWidth={2}
      />
      <span className="flex-1">{label}</span>
      {badge !== undefined && (
        <span
          className={cx(
            "num rounded-full px-1.5 py-0.5 text-[10px] font-bold",
            active
              ? "bg-accent-500 text-brand-950"
              : "bg-white/10 text-slate-200 group-hover:bg-white/15"
          )}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}
