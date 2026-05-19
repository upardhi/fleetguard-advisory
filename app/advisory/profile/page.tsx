"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  User, Mail, Building2, Warehouse, Shield,
  ExternalLink, LogOut, ArrowLeft, KeyRound,
} from "lucide-react";
import { TopBar } from "@/app/_components/TopBar";
import { useAdvisory } from "@/app/_contexts/AdvisoryContext";

const ROLE_LABELS: Record<string, string> = {
  guard:            "Guard",
  wh_manager:       "Warehouse Manager",
  regional_manager: "Regional Manager",
  cso:              "Chief Security Officer",
  company_admin:    "Company Admin",
  super_admin:      "Super Admin",
};

const ROLE_COLORS: Record<string, string> = {
  guard:            "bg-slate-100 text-slate-700",
  wh_manager:       "bg-blue-50 text-blue-700",
  regional_manager: "bg-indigo-50 text-indigo-700",
  cso:              "bg-purple-50 text-purple-700",
  company_admin:    "bg-amber-50 text-amber-700",
  super_admin:      "bg-red-50 text-red-700",
};

export default function ProfilePage() {
  const { user, selectedWarehouse } = useAdvisory();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!user) router.replace("/login");
  }, [user, router]);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/auth/v2/logout", { method: "POST" });
    window.location.href = "/login";
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-sm text-slate-400">Loading profile…</div>
      </div>
    );
  }

  const roleLabel = ROLE_LABELS[user.role] ?? user.role;
  const roleColor = ROLE_COLORS[user.role] ?? "bg-slate-100 text-slate-700";
  const initials = (user.name ?? "")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar title="My Profile" subtitle="Account details and role-based access" />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto space-y-5">

          <Link
            href="/advisory"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition"
          >
            <ArrowLeft size={14} />
            Back to Control Tower
          </Link>

          {/* Identity header */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 rounded-2xl bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-xl shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h1 className="text-lg font-semibold text-slate-900">{user.name}</h1>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${roleColor}`}>
                    {roleLabel}
                  </span>
                </div>
                <p className="text-sm text-slate-500 flex items-center gap-1.5">
                  <Mail size={13} />
                  {user.email}
                </p>
              </div>
            </div>
          </div>

          {/* Account details */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">Account Details</h2>
              <p className="text-xs text-slate-500 mt-0.5">Identity and access information</p>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <KV icon={User} label="Full Name">{user.name}</KV>
              <KV icon={Mail} label="Email">{user.email}</KV>
              <KV icon={Shield} label="Role">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${roleColor}`}>
                  {roleLabel}
                </span>
              </KV>
              <KV icon={Building2} label="Organisation">{user.orgName ?? "—"}</KV>
            </div>
            <div className="px-5 pb-5">
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-3 py-2.5 text-xs text-slate-500">
                <KeyRound size={13} className="text-slate-400" />
                Need to update your name or email? Contact your administrator.
              </div>
            </div>
          </div>

          {/* Warehouse assignment */}
          {selectedWarehouse && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-800">Active Workspace</h2>
                <p className="text-xs text-slate-500 mt-0.5">Warehouse context for advisory analysis</p>
              </div>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <KV icon={Warehouse} label="Warehouse">{selectedWarehouse.name}</KV>
                <KV label="Code">{selectedWarehouse.code}</KV>
                <KV label="City">{selectedWarehouse.city}</KV>
                <KV label="State">{selectedWarehouse.state}</KV>
                {selectedWarehouse.region && (
                  <KV label="Region" className="sm:col-span-2">{selectedWarehouse.region}</KV>
                )}
                {selectedWarehouse.address && (
                  <KV label="Address" className="sm:col-span-2">{selectedWarehouse.address}</KV>
                )}
              </div>
            </div>
          )}

          {/* Team management */}
          {(user.role === "company_admin" || user.role === "super_admin") && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-800">Team Management</h2>
                <p className="text-xs text-slate-500 mt-0.5">Your organisation members</p>
              </div>
              <div className="p-5 flex items-center justify-between gap-3">
                <p className="text-sm text-slate-600">
                  View your team&apos;s roles and warehouse assignments.
                </p>
                <Link
                  href="/advisory/team"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-50 text-brand-700 text-sm font-medium hover:bg-brand-100 transition whitespace-nowrap"
                >
                  <Shield size={14} />
                  View Team
                </Link>
              </div>
            </div>
          )}

          {/* FleetGuard link */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">Full Account Management</h2>
              <p className="text-xs text-slate-500 mt-0.5">Managed in FleetGuard</p>
            </div>
            <div className="p-5">
              <p className="text-sm text-slate-600 mb-3">
                User invitations, role changes, warehouse setup, and billing are managed through your
                <span className="font-semibold text-brand-700"> FleetGuard</span> admin panel.
              </p>
              <a
                href="#"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-900"
              >
                <ExternalLink size={13} />
                Open FleetGuard
              </a>
            </div>
          </div>

          {/* Sign out */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">Session</h2>
              <p className="text-xs text-slate-500 mt-0.5">Sign out of this device</p>
            </div>
            <div className="p-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-800">Log out</p>
                <p className="text-xs text-slate-500">You&apos;ll be returned to the sign-in screen.</p>
              </div>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 text-red-700 text-sm font-medium hover:bg-red-100 transition disabled:opacity-60"
              >
                <LogOut size={14} />
                {loggingOut ? "Signing out…" : "Log out"}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function KV({
  icon: Icon,
  label,
  children,
  className,
}: {
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2.5 ${className ?? ""}`}>
      <div className="flex items-center gap-1 mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
        {Icon && <Icon size={11} className="text-slate-400" />}
        {label}
      </div>
      <div className="text-sm text-slate-800">{children}</div>
    </div>
  );
}
