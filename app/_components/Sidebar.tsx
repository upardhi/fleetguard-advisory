"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Logo from "./Logo";
import { useAdvisory } from "@/app/_contexts/AdvisoryContext";
import {
  LayoutDashboard,
  Route,
  AlertTriangle,
  BrainCircuit,
  Map,
  Settings,
  LogOut,
  Building2,
  ChevronsUpDown,
  Users,
  UserCircle2,
} from "lucide-react";

const NAV = [
  { href: "/advisory",                icon: LayoutDashboard, label: "Control Tower",  exact: true },
  { href: "/advisory/route-analysis", icon: Route,           label: "Route Analysis" },
  { href: "/advisory/disruptions",    icon: AlertTriangle,   label: "Disruptions"   },
  { href: "/advisory/advisories",     icon: BrainCircuit,    label: "AI Advisories" },
  { href: "/advisory/map",            icon: Map,             label: "Risk Map"      },
];

const ADMIN_ROLES = new Set(["company_admin", "super_admin", "superadmin"]);

export default function Sidebar() {
  const path   = usePathname();
  const router = useRouter();
  const { selectedWarehouse, clearWarehouse, user } = useAdvisory();

  const isActive = (href: string, exact?: boolean) =>
    exact ? path === href : path.startsWith(href);

  const isAdmin = user ? ADMIN_ROLES.has(user.role) : false;

  async function handleLogout() {
    await fetch("/api/auth/v2/logout", { method: "POST" });
    window.location.href = "/login";
  }

  function switchWarehouse() {
    clearWarehouse();
    router.push("/advisory/select-warehouse");
  }

  const firstName = user?.name?.split(" ")[0] ?? "Profile";

  return (
    <aside
      style={{ background: "var(--surface-sidebar)" }}
      className="hidden md:flex flex-col w-56 shrink-0 h-screen sticky top-0 border-r border-white/8"
    >
      {/* Logo */}
      <div className="px-4 py-5 border-b border-white/8">
        <Logo />
      </div>

      {/* Warehouse context pill */}
      {selectedWarehouse ? (
        <button
          onClick={switchWarehouse}
          className="mx-3 mt-3 flex items-center gap-2.5 rounded-lg bg-white/8 hover:bg-white/14 border border-white/10 px-3 py-2.5 text-left transition-all group"
        >
          <div className="w-7 h-7 rounded-md bg-accent-500/20 flex items-center justify-center shrink-0">
            <Building2 size={13} className="text-accent-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-brand-300 font-semibold uppercase tracking-wider leading-none mb-0.5">Warehouse</p>
            <p className="text-xs font-semibold text-white truncate leading-tight">{selectedWarehouse.name}</p>
            <p className="text-[10px] text-brand-300 truncate">{selectedWarehouse.city}</p>
          </div>
          <ChevronsUpDown size={13} className="text-brand-400 group-hover:text-white shrink-0 transition-colors" />
        </button>
      ) : user?.role !== "super_admin" && user?.role !== "superadmin" ? (
        <button
          onClick={switchWarehouse}
          className="mx-3 mt-3 flex items-center gap-2 rounded-lg border border-dashed border-white/20 px-3 py-2.5 text-brand-300 hover:text-white hover:border-white/30 transition text-xs font-medium"
        >
          <Building2 size={13} />
          Select Warehouse
        </button>
      ) : null}

      {/* Main nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, icon: Icon, label, exact }) => {
          const active = isActive(href, exact);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                active
                  ? "bg-white/12 text-white"
                  : "text-brand-200 hover:bg-white/8 hover:text-white"
              }`}
            >
              <Icon size={16} className={active ? "text-accent-400" : "text-brand-300"} />
              <span>{label}</span>
              {active && <span className="ml-auto w-1 h-4 rounded-full bg-accent-400" />}
            </Link>
          );
        })}

        {/* Team — company_admin and super_admin only */}
        {isAdmin && (
          <Link
            href="/advisory/team"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              isActive("/advisory/team")
                ? "bg-white/12 text-white"
                : "text-brand-200 hover:bg-white/8 hover:text-white"
            }`}
          >
            <Users
              size={16}
              className={isActive("/advisory/team") ? "text-accent-400" : "text-brand-300"}
            />
            <span>Team</span>
            {isActive("/advisory/team") && (
              <span className="ml-auto w-1 h-4 rounded-full bg-accent-400" />
            )}
          </Link>
        )}
      </nav>

      {/* Org pill */}
      {user?.orgName && (
        <div className="mx-3 mb-2 px-3 py-2 rounded-lg bg-white/5 border border-white/8">
          <p className="text-[10px] text-brand-400 font-medium uppercase tracking-wider">Organisation</p>
          <p className="text-xs text-brand-100 font-medium truncate mt-0.5">{user.orgName}</p>
        </div>
      )}

      {/* Bottom links */}
      <div className="px-3 pb-4 space-y-0.5 border-t border-white/8 pt-3">
        <Link
          href="/advisory/profile"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
            isActive("/advisory/profile")
              ? "bg-white/12 text-white"
              : "text-brand-200 hover:bg-white/8 hover:text-white"
          }`}
        >
          <UserCircle2
            size={16}
            className={isActive("/advisory/profile") ? "text-accent-400" : "text-brand-300"}
          />
          <span className="truncate">{firstName}</span>
        </Link>
        <Link
          href="/advisory/settings"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
            isActive("/advisory/settings")
              ? "bg-white/12 text-white"
              : "text-brand-200 hover:bg-white/8 hover:text-white"
          }`}
        >
          <Settings
            size={16}
            className={isActive("/advisory/settings") ? "text-accent-400" : "text-brand-300"}
          />
          Settings
        </Link>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-brand-200 hover:bg-white/8 hover:text-red-300 transition-all"
        >
          <LogOut size={16} className="text-brand-300" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
