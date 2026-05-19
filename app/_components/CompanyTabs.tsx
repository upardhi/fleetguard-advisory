"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cx } from "../_lib/utils";
import type { FgOrganisation } from "../_services/organisationService";

type Props = {
  orgId: string;
  org: FgOrganisation | null;
};

const TABS = [
  { label: "Overview", path: "", end: true },
  { label: "Users", path: "/users" },
  { label: "Dealers", path: "/dealers" },
  { label: "Warehouses", path: "/warehouses" },
  { label: "Service Providers", path: "/service-providers" },
];

export function CompanyTabs({ orgId, org }: Props) {
  const pathname = usePathname();
  const base = `/superadmin/companies/${orgId}`;

  return (
    <div className="border-b border-slate-200 bg-white px-8">
      {/* Breadcrumb strip */}
      <div className="flex items-center gap-3 py-3">
        <Link
          href="/superadmin/companies"
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-400 hover:text-brand-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All companies
        </Link>
        <span className="text-[12px] text-slate-300">/</span>
        <span className="text-[13px] font-semibold text-slate-900">{org?.name ?? "…"}</span>
        {org && (
          <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-500">
            {org.shortCode}
          </span>
        )}
        {org && !org.isActive && (
          <span className="rounded-full bg-danger-50 px-2 py-0.5 text-[11px] font-semibold text-danger-700 ring-1 ring-danger-200">
            Inactive
          </span>
        )}
      </div>
      {/* Tab row */}
      <div className="-mb-px flex items-center gap-1">
        {TABS.map((tab) => {
          const href = `${base}${tab.path}`;
          const active = tab.end ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={tab.label}
              href={href}
              className={cx(
                "border-b-2 px-4 py-2.5 text-[13px] font-medium transition-colors",
                active
                  ? "border-brand-700 text-brand-800"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
