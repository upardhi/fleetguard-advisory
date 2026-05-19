"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  Building2,
  FileText,
  KeyRound,
  Moon,
  ShieldAlert,
  Truck,
  User,
  Users,
  Warehouse,
} from "lucide-react";
import { TopBar } from "../_components/TopBar";
import { PageHeader } from "../_components/PageHeader";
import { Card, CardHeader } from "../_components/Card";
import { Badge } from "../_components/Badge";
import { Button } from "../_components/Button";
import { useAuthV2 } from "../_hooks/useAuthV2";
import { cx } from "../_lib/utils";
import type { UserRole } from "../_lib/types";

const ROLE_HOME: Record<UserRole, string> = {
  guard:            "/guard",
  wh_manager:       "/manager",
  regional_manager: "/manager",
  cso:              "/cso",
  company_admin:    "/company",
  super_admin:      "/superadmin",
};

interface QuickLink {
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

function roleQuickLinks(role: UserRole): QuickLink[] {
  switch (role) {
    case "guard":
      return [
        { href: "/guard/entry-exit-log", label: "Entry / exit log", description: "Recent gate events at your post", icon: FileText },
        { href: "/guard/visitors",       label: "Visitors",          description: "Current visitor log",             icon: Users },
      ];
    case "wh_manager":
    case "regional_manager":
      return [
        { href: "/manager/drivers",     label: "Drivers",           description: "Roster, DL & background checks", icon: User },
        { href: "/manager/vehicles",    label: "Vehicles",          description: "Fleet compliance",               icon: Truck },
        { href: "/manager/contractors", label: "Service providers", description: "Partner directory",              icon: Building2 },
      ];
    case "cso":
      return [
        { href: "/cso/alerts",       label: "Alerts",       description: "Pan-India alert queue",         icon: Bell },
        { href: "/cso/incidents",    label: "Incidents",    description: "Open & breached SLAs",          icon: ShieldAlert },
        { href: "/cso/audit",        label: "Audit trail",  description: "Immutable platform log",        icon: FileText },
      ];
    case "company_admin":
      return [
        { href: "/company/warehouses",    label: "Warehouses",       description: "Manage warehouse locations",    icon: Warehouse },
        { href: "/company/users",         label: "Users",            description: "Invite and manage access",      icon: Users },
        { href: "/company/service-providers", label: "Service providers", description: "Contractor onboarding",    icon: Building2 },
      ];
    case "super_admin":
      return [
        { href: "/superadmin/companies", label: "Organisations", description: "Manage every company", icon: Building2 },
        { href: "/superadmin/users",     label: "All users",     description: "Platform-wide roster", icon: Users },
      ];
    default:
      return [];
  }
}

export default function SettingsPage() {
  const { fgUser, loading } = useAuthV2();
  const router = useRouter();

  // Local-only toggle state (not persisted — requires a backend field)
  const [notifyAlerts, setNotifyAlerts] = useState(true);
  const [notifyIncidents, setNotifyIncidents] = useState(true);
  const [notifyReports, setNotifyReports] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!fgUser) {
      router.replace("/login");
      return;
    }
    // Guards do not have access to settings — send them to their dashboard
    if (fgUser.role === "guard") {
      router.replace(ROLE_HOME[fgUser.role] ?? "/");
    }
  }, [loading, fgUser, router]);

  if (loading || !fgUser || fgUser.role === "guard") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-[13px] text-slate-400">Loading settings…</div>
      </div>
    );
  }

  const role = fgUser.role;
  const homeHref = ROLE_HOME[role] ?? "/";
  const links = roleQuickLinks(role);

  return (
    <>
      <TopBar breadcrumbs={[{ label: "Account", href: homeHref }, { label: "Settings" }]} />
      <PageHeader
        eyebrow="Account"
        title="Settings"
        subtitle="Manage notifications, access and preferences for your account."
        actions={
          <Link
            href={homeHref}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[12.5px] font-medium text-slate-700 shadow-xs hover:bg-slate-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to dashboard
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-4xl space-y-6">

          {/* ── Account ─────────────────────────────────────────────────── */}
          <Card>
            <CardHeader title="Account" subtitle="Identity managed by your administrator" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Name" value={fgUser.displayName} />
              <Field label="Email" value={fgUser.email} />
              <Field
                label="Role"
                value={
                  <Badge tone="brand">{role.replace(/_/g, " ")}</Badge>
                }
              />
              <Field
                label="Status"
                value={
                  <Badge tone={fgUser.isActive ? "success" : "danger"} dot>
                    {fgUser.isActive ? "Active" : "Inactive"}
                  </Badge>
                }
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-3 py-2.5 text-[11.5px] text-slate-500">
              <KeyRound className="h-3.5 w-3.5 text-slate-400" />
              <span>Need to update your name or email? Contact your administrator.</span>
            </div>
          </Card>

          {/* ── Notifications ──────────────────────────────────────────── */}
          <Card>
            <CardHeader title="Notifications" subtitle="Where we should alert you for events relevant to your role" />
            <div className="divide-y divide-slate-100">
              <Toggle
                label="Operational alerts"
                description="Critical and warning alerts at your warehouse"
                checked={notifyAlerts}
                onToggle={() => setNotifyAlerts((v) => !v)}
              />
              <Toggle
                label="Incident updates"
                description="New incidents, assignments and SLA breaches"
                checked={notifyIncidents}
                onToggle={() => setNotifyIncidents((v) => !v)}
              />
              <Toggle
                label="Weekly reports"
                description="MIS summary emailed every Monday"
                checked={notifyReports}
                onToggle={() => setNotifyReports((v) => !v)}
              />
            </div>
          </Card>

          {/* ── Appearance ────────────────────────────────────────────── */}
          <Card>
            <CardHeader title="Appearance" subtitle="Display preferences for your device" />
            <Field
              label="Theme"
              value={
                <div className="flex items-center gap-2">
                  <Moon className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-slate-700">System default</span>
                  <span className="text-[11px] text-slate-400">(coming soon)</span>
                </div>
              }
            />
          </Card>

          {/* ── Role-specific shortcuts ───────────────────────────────── */}
          {links.length > 0 && (
            <Card>
              <CardHeader
                title="Quick links"
                subtitle={`Shortcuts available to your ${role.replace(/_/g, " ")} role`}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {links.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="group flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 transition hover:border-brand-300 hover:bg-brand-50/40"
                  >
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-brand-50 text-brand-700 ring-1 ring-brand-100 group-hover:bg-brand-100">
                      <l.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-slate-900">{l.label}</div>
                      <div className="text-[11.5px] text-slate-500">{l.description}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {/* ── Danger zone ───────────────────────────────────────────── */}
          <Card>
            <CardHeader title="Session" subtitle="Sign out of your account on this device" />
            <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-slate-800">Log out</div>
                <div className="text-[11.5px] text-slate-500">
                  You&apos;ll be returned to the sign-in screen.
                </div>
              </div>
              <SignOutButton />
            </div>
          </Card>

        </div>
      </div>
    </>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2.5">
      <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <div className="text-[13px] text-slate-800">{value}</div>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onToggle,
}: {
  label: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-slate-800">{label}</div>
        <div className="text-[11.5px] text-slate-500">{description}</div>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={cx(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition",
          checked ? "bg-brand-600" : "bg-slate-200"
        )}
        role="switch"
        aria-checked={checked}
      >
        <span
          className={cx(
            "inline-block h-4 w-4 transform rounded-full bg-white shadow transition",
            checked ? "translate-x-[18px]" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
}

function SignOutButton() {
  const { logOut } = useAuthV2();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function handle() {
    setBusy(true);
    try { await logOut(); } catch (err) { console.error(err); }
    router.push("/login");
  }
  return (
    <Button variant="danger" size="sm" onClick={handle} disabled={busy}>
      {busy ? "Signing out…" : "Log out"}
    </Button>
  );
}
