"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, Settings as SettingsIcon, User } from "lucide-react";
import { Avatar } from "./Avatar";
import { useAuthV2 } from "../_hooks/useAuthV2";
import { cx } from "../_lib/utils";
import type { UserRole } from "../_lib/types";

const ROLE_LABELS: Record<UserRole, string> = {
  guard:            "Guard",
  wh_manager:       "Warehouse Manager",
  regional_manager: "Regional Manager",
  cso:              "Chief Security Officer",
  company_admin:    "Company Admin",
  super_admin:      "Super Admin",
};

export function ProfileMenu() {
  const { fgUser, logOut } = useAuthV2();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logOut();
    } catch (err) {
      console.error(err);
    } finally {
      setOpen(false);
      setLoggingOut(false);
      router.push("/login");
    }
  }

  const name  = fgUser?.displayName ?? "Account";
  const email = fgUser?.email ?? "";
  const role  = fgUser ? (ROLE_LABELS[fgUser.role] ?? fgUser.role) : "";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cx(
          "flex items-center gap-2 rounded-md border border-slate-200 bg-white py-1 pl-1 pr-2 text-[12.5px] text-slate-700 transition hover:bg-slate-50",
          open && "bg-slate-50",
        )}
        aria-haspopup="menu"
        aria-expanded={open}
        title={name}
      >
        <Avatar name={name} size="sm" tone="brand" />
        <div className="hidden flex-col items-start leading-tight sm:flex">
          <span className="max-w-[120px] truncate font-semibold text-slate-900">{name}</span>
          {role && <span className="text-[10.5px] text-slate-500">{role}</span>}
        </div>
        <ChevronDown className={cx("h-3.5 w-3.5 text-slate-400 transition", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          {/* Identity block */}
          <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/60 p-3">
            <Avatar name={name} size="md" tone="brand" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-slate-900">{name}</div>
              {email && <div className="truncate text-[11px] text-slate-500">{email}</div>}
              {role && (
                <div className="mt-1 inline-flex rounded-full bg-brand-50 px-2 py-0.5 text-[10.5px] font-semibold text-brand-700">
                  {role}
                </div>
              )}
            </div>
          </div>

          <div className="p-1">
            <MenuLink href="/profile" icon={User} label="View Profile" onClick={() => setOpen(false)} />
            {fgUser?.role !== "guard" && (
              <MenuLink href="/settings" icon={SettingsIcon} label="Settings" onClick={() => setOpen(false)} />
            )}
          </div>

          <div className="border-t border-slate-100 p-1">
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[12.5px] font-medium text-danger-700 hover:bg-danger-50 disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" />
              {loggingOut ? "Logging out…" : "Logout"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  icon: Icon,
  label,
  onClick,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-2 rounded-md px-3 py-2 text-[12.5px] text-slate-700 hover:bg-slate-50"
    >
      <Icon className="h-4 w-4 text-slate-500" />
      {label}
    </Link>
  );
}
