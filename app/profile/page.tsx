"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Calendar,
  Globe2,
  Mail,
  MapPin,
  Phone,
  Shield,
  UserCog,
  Warehouse,
} from "lucide-react";
import { TopBar } from "../_components/TopBar";
import { PageHeader } from "../_components/PageHeader";
import { Card, CardHeader } from "../_components/Card";
import { Badge } from "../_components/Badge";
import { Avatar } from "../_components/Avatar";
import { useAuthV2 } from "../_hooks/useAuthV2";
import { getWarehouseById, type FgWarehouse } from "../_services/warehouseService";
import { getOrganisationById, type FgOrganisation } from "../_services/organisationService";
import { getUsersByOrg, getWhManagerForWarehouse, type FgUser } from "../_services/userService";
import { cx, fmtDate } from "../_lib/utils";
import type { UserRole } from "../_lib/types";

const ROLE_LABELS: Record<UserRole, string> = {
  guard:            "Guard",
  wh_manager:       "Warehouse Manager",
  regional_manager: "Regional Manager",
  cso:              "Chief Security Officer",
  company_admin:    "Company Admin",
  super_admin:      "Super Admin",
};

const ROLE_HOME: Record<UserRole, string> = {
  guard:            "/guard",
  wh_manager:       "/manager",
  regional_manager: "/manager",
  cso:              "/cso",
  company_admin:    "/company",
  super_admin:      "/superadmin",
};

export default function ProfilePage() {
  const { fgUser, loading } = useAuthV2();
  const router = useRouter();

  const [warehouse, setWarehouse]                 = useState<FgWarehouse | null>(null);
  const [assignedWarehouses, setAssignedWarehouses] = useState<FgWarehouse[]>([]);
  const [org, setOrg]                             = useState<FgOrganisation | null>(null);
  const [whManager, setWhManager]                 = useState<FgUser | null>(null);
  const [companyAdmin, setCompanyAdmin]           = useState<FgUser | null>(null);

  useEffect(() => {
    if (!loading && !fgUser) router.replace("/login");
  }, [loading, fgUser, router]);

  useEffect(() => {
    if (!fgUser) return;
    if (fgUser.warehouseId) {
      getWarehouseById(fgUser.warehouseId).then(setWarehouse).catch(console.error);
      // Resolve the warehouse manager via fg_users (single source of truth).
      // Skip self-lookup so a wh_manager doesn't render themselves as their
      // own reporting manager.
      getWhManagerForWarehouse(fgUser.warehouseId)
        .then((mgr) => {
          if (mgr && mgr.uid !== fgUser.uid) setWhManager(mgr);
        })
        .catch(console.error);
    }
    // Regional managers are scoped by warehouseIds[] — fetch every assigned
    // warehouse so the profile lists all of them. Legacy records that only
    // have the singular warehouseId fall back to that for display.
    if (fgUser.role === "regional_manager") {
      const ids = (fgUser.warehouseIds ?? []).length > 0
        ? fgUser.warehouseIds!
        : fgUser.warehouseId
          ? [fgUser.warehouseId]
          : [];
      if (ids.length > 0) {
        Promise.all(ids.map((id) => getWarehouseById(id)))
          .then((list) => setAssignedWarehouses(list.filter((w): w is FgWarehouse => w !== null)))
          .catch(console.error);
      }
    }
    if (fgUser.orgId) {
      getOrganisationById(fgUser.orgId).then(setOrg).catch(console.error);
      // Skip self-lookup when the signed-in user is themselves the company admin
      if (fgUser.role !== "company_admin") {
        getUsersByOrg(fgUser.orgId)
          .then((users) => {
            const admin = users.find((u) => u.role === "company_admin" && u.isActive);
            setCompanyAdmin(admin ?? null);
          })
          .catch(console.error);
      }
    }
  }, [fgUser]);

  if (loading || !fgUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-[13px] text-slate-400">Loading profile…</div>
      </div>
    );
  }

  const role = fgUser.role;
  const homeHref = ROLE_HOME[role] ?? "/";

  // Resolve reporting relationship per role
  let reportingTo: { name: string; role: string; email?: string } | null = null;
  if (role === "guard" && whManager) {
    reportingTo = { name: whManager.displayName, role: ROLE_LABELS[whManager.role] ?? whManager.role, email: whManager.email };
  } else if ((role === "wh_manager" || role === "regional_manager" || role === "cso") && companyAdmin) {
    reportingTo = { name: companyAdmin.displayName, role: ROLE_LABELS[companyAdmin.role] ?? companyAdmin.role, email: companyAdmin.email };
  }

  return (
    <>
      <TopBar breadcrumbs={[{ label: "Account", href: homeHref }, { label: "Profile" }]} />
      <PageHeader
        eyebrow="Account"
        title="My profile"
        subtitle="Your personal account information and role-based access."
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

          {/* ── Identity header ────────────────────────────────────────────── */}
          <Card>
            <div className="flex flex-wrap items-center gap-4">
              <Avatar name={fgUser.displayName} size="lg" tone="brand" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[18px] font-semibold text-slate-900">{fgUser.displayName}</h2>
                  <Badge tone="brand">{ROLE_LABELS[role] ?? role}</Badge>
                  {!fgUser.isActive && <Badge tone="danger">Inactive</Badge>}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" /> {fgUser.email}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" /> Joined {fmtDate(fgUser.createdAt)}
                  </span>
                </div>
              </div>
              <Link
                href="/settings"
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[12.5px] font-medium text-slate-700 shadow-xs hover:bg-slate-50"
              >
                <UserCog className="h-3.5 w-3.5" />
                Settings
              </Link>
            </div>
          </Card>

          {/* ── Account details (common to all roles) ──────────────────────── */}
          <Card>
            <CardHeader title="Account details" subtitle="Basic identity and access" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Kv label="Full name">{fgUser.displayName}</Kv>
              <Kv label="Email">{fgUser.email}</Kv>
              <Kv label="Role">
                <Badge tone="brand">{ROLE_LABELS[role] ?? role}</Badge>
              </Kv>
              <Kv label="Status">
                <Badge tone={fgUser.isActive ? "success" : "danger"} dot>
                  {fgUser.isActive ? "Active" : "Inactive"}
                </Badge>
              </Kv>
              <Kv label="Member since">{fmtDate(fgUser.createdAt)}</Kv>
            </div>
          </Card>

          {/* ── Guard assignment ───────────────────────────────────────────── */}
          {role === "guard" && (
            <Card>
              <CardHeader title="Assignment" subtitle="Where you're posted and who manages you" />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Kv label="Warehouse" icon={Warehouse}>
                  {warehouse ? (
                    <>
                      <div className="font-semibold text-slate-900">{warehouse.name}</div>
                      <div className="text-[11.5px] text-slate-500">
                        {warehouse.code} · {warehouse.city}{warehouse.state ? `, ${warehouse.state}` : ""}
                      </div>
                    </>
                  ) : (
                    <span className="text-slate-400">Not assigned</span>
                  )}
                </Kv>
                <Kv label="Company" icon={Building2}>
                  {org ? org.name : <span className="text-slate-400">—</span>}
                </Kv>
                <Kv label="Warehouse manager" icon={Shield} className="sm:col-span-2">
                  {whManager ? (
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900">{whManager.displayName}</div>
                        <div className="text-[11.5px] text-slate-500">
                          {ROLE_LABELS[whManager.role] ?? whManager.role}
                        </div>
                      </div>
                      {whManager.email && (
                        <a
                          href={`mailto:${whManager.email}`}
                          className="inline-flex items-center gap-1.5 rounded-md border border-brand-200 bg-brand-50 px-2.5 py-1 text-[12px] font-medium text-brand-700 hover:bg-brand-100"
                        >
                          <Mail className="h-3.5 w-3.5" />
                          {whManager.email}
                        </a>
                      )}
                    </div>
                  ) : (
                    <span className="text-slate-400">No manager assigned to this warehouse</span>
                  )}
                </Kv>
              </div>
            </Card>
          )}

          {/* ── Warehouse / Regional manager ───────────────────────────────── */}
          {(role === "wh_manager" || role === "regional_manager") && (
            <Card>
              <CardHeader title="Workspace" subtitle="Your assigned warehouse, company, and reporting admin" />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Kv label="Company" icon={Building2}>
                  {org ? (
                    <>
                      <div className="font-semibold text-slate-900">{org.name}</div>
                      <div className="text-[11.5px] text-slate-500">{org.shortCode}</div>
                    </>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </Kv>
                {role === "regional_manager" ? (
                  <Kv
                    label={`Assigned warehouses${assignedWarehouses.length > 0 ? ` (${assignedWarehouses.length})` : ""}`}
                    icon={Warehouse}
                    className="sm:col-span-2"
                  >
                    {assignedWarehouses.length === 0 ? (
                      <span className="text-slate-400">Not assigned</span>
                    ) : (
                      <ul className="-mx-1 divide-y divide-slate-100">
                        {assignedWarehouses.map((wh) => (
                          <li key={wh.id} className="flex items-start gap-2 px-1 py-1.5">
                            <Warehouse className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" />
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900">{wh.name}</div>
                              <div className="text-[11.5px] text-slate-500">
                                {wh.code} · {wh.city}{wh.state ? `, ${wh.state}` : ""}
                                {wh.region && ` · ${wh.region}`}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Kv>
                ) : (
                  <Kv label="Warehouse" icon={Warehouse}>
                    {warehouse ? (
                      <>
                        <div className="font-semibold text-slate-900">{warehouse.name}</div>
                        <div className="text-[11.5px] text-slate-500">
                          {warehouse.code} · {warehouse.city}{warehouse.state ? `, ${warehouse.state}` : ""}
                          {warehouse.region && ` · ${warehouse.region}`}
                        </div>
                      </>
                    ) : (
                      <span className="text-slate-400">Not assigned</span>
                    )}
                  </Kv>
                )}
                {reportingTo && (
                  <Kv label="Reporting admin" icon={Shield}>
                    <div className="font-semibold text-slate-900">{reportingTo.name}</div>
                    <div className="text-[11.5px] text-slate-500">{reportingTo.role}</div>
                    {reportingTo.email && <div className="text-[11px] text-slate-400">{reportingTo.email}</div>}
                  </Kv>
                )}
                {org && (
                  <Kv label="Company contact">
                    <div className="text-[12px] text-slate-700">{org.contactName}</div>
                    {org.contactEmail && <div className="text-[11px] text-slate-500">{org.contactEmail}</div>}
                    {org.contactPhone && <div className="text-[11px] text-slate-500">{org.contactPhone}</div>}
                  </Kv>
                )}
              </div>
            </Card>
          )}

          {/* ── CSO ───────────────────────────────────────────────────────── */}
          {role === "cso" && (
            <Card>
              <CardHeader title="Scope" subtitle="Pan-India command across your company's warehouses" />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Kv label="Company" icon={Building2}>
                  {org ? (
                    <>
                      <div className="font-semibold text-slate-900">{org.name}</div>
                      <div className="text-[11.5px] text-slate-500">{org.shortCode}</div>
                    </>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </Kv>
                <Kv label="Coverage" icon={Globe2}>
                  <span className="font-semibold text-slate-900">All warehouses</span>
                  <div className="text-[11.5px] text-slate-500">Pan-India security oversight</div>
                </Kv>
                {reportingTo && (
                  <Kv label="Reporting admin" icon={Shield}>
                    <div className="font-semibold text-slate-900">{reportingTo.name}</div>
                    <div className="text-[11.5px] text-slate-500">{reportingTo.role}</div>
                    {reportingTo.email && <div className="text-[11px] text-slate-400">{reportingTo.email}</div>}
                  </Kv>
                )}
              </div>
            </Card>
          )}

          {/* ── Company admin ─────────────────────────────────────────────── */}
          {role === "company_admin" && org && (
            <Card>
              <CardHeader title="Company" subtitle="Organisation you administer" />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Kv label="Name" icon={Building2}>
                  <div className="font-semibold text-slate-900">{org.name}</div>
                  <div className="text-[11.5px] text-slate-500">{org.shortCode}</div>
                </Kv>
                <Kv label="Primary contact">
                  <div className="text-slate-900">{org.contactName}</div>
                  {org.contactEmail && (
                    <div className="inline-flex items-center gap-1 text-[11.5px] text-slate-500">
                      <Mail className="h-3 w-3" /> {org.contactEmail}
                    </div>
                  )}
                  {org.contactPhone && (
                    <div className="inline-flex items-center gap-1 text-[11.5px] text-slate-500">
                      <Phone className="h-3 w-3" /> {org.contactPhone}
                    </div>
                  )}
                </Kv>
                <Kv label="Location" icon={MapPin}>
                  {org.address && <div className="text-[12.5px] text-slate-700">{org.address}</div>}
                  <div className="text-[11.5px] text-slate-500">
                    {org.city}{org.state ? `, ${org.state}` : ""}
                  </div>
                </Kv>
                <Kv label="Status">
                  <Badge tone={org.isActive ? "success" : "muted"} dot>
                    {org.isActive ? "Active" : "Inactive"}
                  </Badge>
                </Kv>
              </div>
            </Card>
          )}

          {/* ── Super admin ───────────────────────────────────────────────── */}
          {role === "super_admin" && (
            <Card>
              <CardHeader title="Platform access" subtitle="Global access across all companies" />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Kv label="Scope" icon={Globe2}>
                  <div className="font-semibold text-slate-900">Global</div>
                  <div className="text-[11.5px] text-slate-500">All organisations and warehouses</div>
                </Kv>
                <Kv label="Role">
                  <Badge tone="danger">Super Admin</Badge>
                  <div className="mt-1 text-[11px] text-slate-500">
                    Can manage organisations, users, and global configuration.
                  </div>
                </Kv>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

// ── Small field helper ───────────────────────────────────────────────────────

function Kv({
  label,
  icon: Icon,
  children,
  className,
}: {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2.5", className)}>
      <div className="mb-1 flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </div>
      <div className="text-[13px] text-slate-800">{children}</div>
    </div>
  );
}
