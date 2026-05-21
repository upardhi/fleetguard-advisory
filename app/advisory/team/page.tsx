"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Users, Warehouse, Search, ArrowLeft,
  ExternalLink, Building2, UserCheck, UserX, MapPin, Check, X,
} from "lucide-react";
import { TopBar } from "@/app/_components/TopBar";
import { useAdvisory } from "@/app/_contexts/AdvisoryContext";

interface TeamMember {
  id:              string;
  email:           string;
  full_name:       string;
  role:            string;
  is_active:       boolean;
  warehouse_id:    string | null;
  warehouse_name:  string | null;
  warehouse_code:  string | null;
  warehouse_city:  string | null;
  created_at:      string;
  advisory_region: string | null;
  advisory_city:   string | null;
}

const REGION_META_TEAM: Record<string, { label: string; bg: string; text: string; border: string }> = {
  north: { label: "North", bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200" },
  east:  { label: "East",  bg: "bg-orange-50",  text: "text-orange-700",  border: "border-orange-200" },
  west:  { label: "West",  bg: "bg-purple-50",  text: "text-purple-700",  border: "border-purple-200" },
  south: { label: "South", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
};

interface RegionCity { id: string; name: string; state: string | null }

const ROLE_LABELS: Record<string, string> = {
  guard:            "Guard",
  wh_manager:       "WH Manager",
  regional_manager: "Regional Manager",
  cso:              "CSO",
  company_admin:    "Company Admin",
  super_admin:      "Super Admin",
};

const ROLE_COLORS: Record<string, string> = {
  guard:            "bg-slate-100 text-slate-600",
  wh_manager:       "bg-blue-50 text-blue-700",
  regional_manager: "bg-indigo-50 text-indigo-700",
  cso:              "bg-purple-50 text-purple-700",
  company_admin:    "bg-amber-50 text-amber-700",
  super_admin:      "bg-red-50 text-red-700",
};

export default function TeamPage() {
  const { user } = useAdvisory();
  const [members, setMembers]         = useState<TeamMember[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");
  const [roleFilter, setRoleFilter]   = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  // Region assignment modal
  const [assignTarget, setAssignTarget] = useState<TeamMember | null>(null);
  const [assignRegion, setAssignRegion] = useState("");
  const [assignCity, setAssignCity]     = useState("");
  const [assignCities, setAssignCities] = useState<RegionCity[]>([]);
  const [assignSaving, setAssignSaving] = useState(false);

  async function openAssign(m: TeamMember) {
    setAssignTarget(m);
    setAssignRegion(m.advisory_region ?? "");
    setAssignCity("");
    setAssignCities([]);
    if (m.advisory_region) {
      const r = await fetch(`/api/advisory/v1/regions/${m.advisory_region}`, { credentials: "include" });
      if (r.ok) {
        const d = await r.json() as { cities: RegionCity[] };
        setAssignCities(d.cities ?? []);
      }
    }
  }

  async function onAssignRegionChange(regionId: string) {
    setAssignRegion(regionId);
    setAssignCity("");
    if (regionId) {
      const r = await fetch(`/api/advisory/v1/regions/${regionId}`, { credentials: "include" });
      if (r.ok) {
        const d = await r.json() as { cities: RegionCity[] };
        setAssignCities(d.cities ?? []);
      }
    } else {
      setAssignCities([]);
    }
  }

  async function saveAssign() {
    if (!assignTarget) return;
    setAssignSaving(true);
    try {
      await fetch("/api/advisory/v1/user-prefs", {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: assignTarget.id,
          region_id: assignRegion || null,
          city_id: assignCity || null,
        }),
      });
      // Update local state
      setMembers((prev) => prev.map((m) =>
        m.id === assignTarget.id
          ? { ...m, advisory_region: assignRegion || null, advisory_city: assignCities.find((c) => c.id === assignCity)?.name ?? null }
          : m,
      ));
      setAssignTarget(null);
    } finally {
      setAssignSaving(false);
    }
  }

  useEffect(() => {
    fetch("/api/advisory/v1/team")
      .then((r) => r.json())
      .then((data) => setMembers(data.users ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const roles = useMemo(() => Array.from(new Set(members.map((m) => m.role))), [members]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return members.filter((m) => {
      const matchSearch =
        !q ||
        (m.full_name ?? "").toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        (m.warehouse_name ?? "").toLowerCase().includes(q);
      const matchRole   = roleFilter === "all" || m.role === roleFilter;
      const matchStatus = statusFilter === "all" || (statusFilter === "active" ? m.is_active : !m.is_active);
      return matchSearch && matchRole && matchStatus;
    });
  }, [members, search, roleFilter, statusFilter]);

  const totalActive   = members.filter((m) =>  m.is_active).length;
  const totalInactive = members.filter((m) => !m.is_active).length;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar title="Team Members" subtitle={`${members.length} users in your organisation`} />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-5">

          <div className="flex items-center justify-between">
            <Link
              href="/advisory"
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition"
            >
              <ArrowLeft size={14} />
              Back to Control Tower
            </Link>
            <a
              href="#"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-900"
            >
              <ExternalLink size={13} />
              Manage in FleetGuard
            </a>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <StatBox icon={Users}     label="Total Members" value={members.length}    color="bg-brand-50 text-brand-700" />
            <StatBox icon={UserCheck} label="Active"        value={totalActive}       color="bg-green-50 text-green-700" />
            <StatBox icon={UserX}     label="Inactive"      value={totalInactive}     color="bg-red-50 text-red-600"    />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, email, or warehouse…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
            >
              <option value="all">All roles</option>
              {roles.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-48 text-sm text-slate-400">
                <div className="text-center">
                  <Users size={32} className="mx-auto mb-2 text-slate-200" />
                  Loading team members…
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400">
                <Users size={32} className="mb-2 text-slate-200" />
                <p className="text-sm">No members match your search</p>
                {search && (
                  <button onClick={() => setSearch("")} className="mt-2 text-xs text-brand-600 hover:underline">
                    Clear search
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Member</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Role</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Warehouse</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Ops Region</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((m) => {
                      const initials = (m.full_name ?? "")
                        .split(" ")
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase() || "?";
                      return (
                        <tr key={m.id} className="hover:bg-slate-50/60 transition">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-700 font-bold text-xs flex items-center justify-center shrink-0">
                                {initials}
                              </div>
                              <div className="min-w-0">
                                <div className="font-medium text-slate-900 truncate">{m.full_name}</div>
                                <div className="text-xs text-slate-500 truncate">{m.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[m.role] ?? "bg-slate-100 text-slate-600"}`}>
                              {ROLE_LABELS[m.role] ?? m.role}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            {m.warehouse_name ? (
                              <div className="flex items-center gap-1.5 text-slate-700">
                                <Warehouse size={12} className="text-slate-400 shrink-0" />
                                <span className="truncate max-w-[140px]">{m.warehouse_name}</span>
                                {m.warehouse_city && (
                                  <span className="text-slate-400 text-xs">· {m.warehouse_city}</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs">Not assigned</span>
                            )}
                          </td>
                          {/* Ops Region */}
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              {m.advisory_region ? (
                                <div className="flex items-center gap-1.5">
                                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                                    REGION_META_TEAM[m.advisory_region]
                                      ? `${REGION_META_TEAM[m.advisory_region].bg} ${REGION_META_TEAM[m.advisory_region].text} ${REGION_META_TEAM[m.advisory_region].border}`
                                      : "bg-slate-100 text-slate-500 border-slate-200"
                                  }`}>
                                    {REGION_META_TEAM[m.advisory_region]?.label ?? m.advisory_region}
                                  </span>
                                  {m.advisory_city && (
                                    <span className="text-[10px] text-slate-400">· {m.advisory_city}</span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400 italic">Not set</span>
                              )}
                              {user && ["company_admin", "super_admin", "cso"].includes(user.role) && (
                                <button
                                  onClick={() => openAssign(m)}
                                  className="text-[10px] text-brand-600 font-medium hover:text-brand-800 transition shrink-0"
                                >
                                  {m.advisory_region ? "Edit" : "Assign"}
                                </button>
                              )}
                            </div>
                          </td>

                          <td className="px-5 py-3.5">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              m.is_active ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
                            }`}>
                              {m.is_active ? "Active" : "Inactive"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Read-only note */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
            <Building2 size={15} className="text-amber-600 shrink-0 mt-0.5" />
            <span>
              Role changes, warehouse assignment, and account management are handled in{" "}
              <span className="font-semibold">FleetGuard</span> admin panel.
              Ops Region assignment is managed here.
            </span>
          </div>

        </div>
      </div>

      {/* Region assignment modal */}
      {assignTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Assign Ops Region</h3>
                <p className="text-xs text-slate-500 mt-0.5">{assignTarget.full_name} · {assignTarget.email}</p>
              </div>
              <button onClick={() => setAssignTarget(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Region select */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Region</p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(REGION_META_TEAM).map(([id, meta]) => (
                    <button
                      key={id}
                      onClick={() => onAssignRegionChange(id)}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                        assignRegion === id
                          ? `${meta.bg} ${meta.text} ${meta.border}`
                          : "bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <span>{meta.label}</span>
                      {assignRegion === id && <Check size={13} />}
                    </button>
                  ))}
                </div>
              </div>

              {/* City select */}
              {assignRegion && assignCities.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">City (optional)</p>
                  <select
                    value={assignCity}
                    onChange={(e) => setAssignCity(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <option value="">— All {REGION_META_TEAM[assignRegion]?.label} cities —</option>
                    {assignCities.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}{c.state ? ` · ${c.state}` : ""}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={saveAssign}
                  disabled={assignSaving || !assignRegion}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand-700 text-white text-sm font-semibold hover:bg-brand-800 transition disabled:opacity-50"
                >
                  {assignSaving ? "Saving…" : "Save Assignment"}
                </button>
                <button
                  onClick={() => setAssignTarget(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatBox({
  icon: Icon, label, value, color,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={18} />
      </div>
      <div>
        <div className="text-2xl font-bold text-slate-900">{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </div>
  );
}
