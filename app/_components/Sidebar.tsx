"use client";

import { useState, useRef, useEffect } from "react";
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

// ── Advisory platform default Sidebar ────────────────────────────
// Used by app/advisory/layout.tsx — reads context so no props needed.

const ADVISORY_NAV: Section[] = [
  {
    items: [
      { href: "/advisory",               label: "Control Tower",     icon: "dashboard", end: true },
      { href: "/advisory/disruptions",   label: "Disruptions",       icon: "shieldAlert" },
      { href: "/advisory/advisories",    label: "AI Advisories",     icon: "sparkles" },
      { href: "/advisory/map",           label: "Risk Map",          icon: "globe" },
      { href: "/advisory/route-analysis",label: "Route Analysis",    icon: "truck" },
    ],
  },
  {
    heading: "Pre-Planning",
    items: [
      { href: "/advisory/trips",      label: "Trips",             icon: "truck" },
      { href: "/advisory/planner",    label: "Dispatch Planner",  icon: "navigation" },
      { href: "/advisory/planned",    label: "Planned Dispatches",icon: "listChecks" },
      { href: "/advisory/corridors",  label: "Corridor Watch",    icon: "mapPin" },
      { href: "/advisory/calendar",   label: "Events Calendar",   icon: "calendar" },
    ],
  },
  {
    heading: "Account",
    items: [
      { href: "/advisory/profile",  label: "My Profile",  icon: "user" },
      { href: "/advisory/settings", label: "Settings",    icon: "file" },
      { href: "/advisory/team",     label: "Team",        icon: "users" },
    ],
  },
];

export default function AdvisorySidebar() {
  const { user, warehouses, selectedWarehouse, selectWarehouse } = useAdvisory();

  const warehouseOptions: WarehouseOption[] = warehouses.map((w) => ({
    id: w.id, name: w.name, city: w.city, state: w.state,
  }));

  function handleWarehouseChange(id: string) {
    const w = warehouses.find((wh) => wh.id === id);
    if (w) selectWarehouse(w);
  }

  return (
    <Sidebar
      sections={ADVISORY_NAV}
      user={{
        name: user?.name ?? "—",
        role: user?.role ?? "",
      }}
      workspace={{
        name: selectedWarehouse?.name ?? "All Warehouses",
        subtitle: selectedWarehouse
          ? `${selectedWarehouse.city}, ${selectedWarehouse.state}`
          : "Pan-India View",
      }}
      warehouses={warehouseOptions}
      selectedWarehouseId={selectedWarehouse?.id ?? "all"}
      onWarehouseChange={handleWarehouseChange}
    />
  );
}
