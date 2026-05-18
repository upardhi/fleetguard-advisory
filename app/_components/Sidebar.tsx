"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";
import {
  LayoutDashboard,
  Route,
  AlertTriangle,
  BrainCircuit,
  Map,
  Settings,
  LogOut,
} from "lucide-react";

const NAV = [
  { href: "/advisory",              icon: LayoutDashboard, label: "Control Tower",     exact: true },
  { href: "/advisory/route-analysis", icon: Route,           label: "Route Analysis"   },
  { href: "/advisory/disruptions",  icon: AlertTriangle,   label: "Disruptions"      },
  { href: "/advisory/advisories",   icon: BrainCircuit,    label: "AI Advisories"    },
  { href: "/advisory/map",          icon: Map,             label: "Risk Map"         },
];

export default function Sidebar() {
  const path = usePathname();

  const active = (href: string, exact?: boolean) =>
    exact ? path === href : path.startsWith(href);

  async function handleLogout() {
    await fetch("/api/auth/v2/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <aside
      style={{ background: "var(--surface-sidebar)" }}
      className="hidden md:flex flex-col w-56 shrink-0 h-screen sticky top-0 border-r border-white/8"
    >
      {/* Logo */}
      <div className="px-4 py-5 border-b border-white/8">
        <Logo />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, icon: Icon, label, exact }) => {
          const isActive = active(href, exact);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? "bg-white/12 text-white"
                  : "text-brand-200 hover:bg-white/8 hover:text-white"
              }`}
            >
              <Icon size={16} className={isActive ? "text-accent-400" : "text-brand-300"} />
              <span>{label}</span>
              {isActive && (
                <span className="ml-auto w-1 h-4 rounded-full bg-accent-400" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 pb-4 space-y-0.5 border-t border-white/8 pt-3">
        <Link
          href="/advisory/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-brand-200 hover:bg-white/8 hover:text-white transition-all"
        >
          <Settings size={16} className="text-brand-300" />
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
