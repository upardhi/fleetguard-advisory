"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { Card } from "./Card";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Avatar } from "./Avatar";
import { SlidePanel } from "./SlidePanel";
import { cx, fmtDate, fmtAgo } from "../_lib/utils";
import {
  getTicketsByOrg,
  getTicketsByWarehouse,
  getTicketsByWarehouses,
  REASON_LABELS,
  STATUS_LABELS,
  type FgSupportTicket,
  type SupportTicketStatus,
} from "../_services/supportTicketService";
import type { FgUser } from "../_services/userService";

const STATUS_FILTER: Array<SupportTicketStatus | "all"> = [
  "all",
  "ongoing",
  "in_progress",
  "resolved",
  "closed",
];

function statusTone(
  s: SupportTicketStatus,
): "warning" | "info" | "success" | "muted" {
  if (s === "ongoing") return "warning";
  if (s === "in_progress") return "info";
  if (s === "resolved") return "success";
  return "muted";
}

async function loadScopedTickets(user: FgUser): Promise<FgSupportTicket[]> {
  if (user.role === "cso") {
    return user.orgId ? getTicketsByOrg(user.orgId) : [];
  }
  if (user.role === "regional_manager") {
    const ids = user.warehouseIds && user.warehouseIds.length > 0
      ? user.warehouseIds
      : (user.warehouseId ? [user.warehouseId] : []);
    return getTicketsByWarehouses(ids);
  }
  // wh_manager
  return user.warehouseId ? getTicketsByWarehouse(user.warehouseId) : [];
}

/**
 * Read-only tickets view for the roles that can raise tickets. Scope is derived
 * from `fgUser`:
 *   • wh_manager       → own warehouse
 *   • regional_manager → assigned warehouseIds
 *   • cso              → whole org
 *
 * Status transitions are a super-admin-only action — this view only displays.
 */
export function TicketsListView({ fgUser }: { fgUser: FgUser | null }) {
  const [tickets, setTickets] = useState<FgSupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SupportTicketStatus | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const reload = () => {
    if (!fgUser) return;
    setLoading(true);
    loadScopedTickets(fgUser)
      .then(setTickets)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fgUser?.uid, fgUser?.orgId, fgUser?.warehouseId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (!q) return true;
      return (
        t.driverSnapshot.fullName.toLowerCase().includes(q) ||
        t.driverSnapshot.dlNumber.toLowerCase().includes(q) ||
        t.createdByName.toLowerCase().includes(q) ||
        REASON_LABELS[t.reason].toLowerCase().includes(q)
      );
    });
  }, [tickets, search, statusFilter]);

  const counts = useMemo(() => {
    const c: Record<SupportTicketStatus | "all", number> = {
      all: tickets.length,
      ongoing: 0,
      in_progress: 0,
      resolved: 0,
      closed: 0,
    };
    for (const t of tickets) c[t.status]++;
    return c;
  }, [tickets]);

  const selected = tickets.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FILTER.map((s) => {
            const label = s === "all" ? "All" : STATUS_LABELS[s];
            const count = counts[s];
            const active = statusFilter === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={cx(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
                  active
                    ? "border-brand-500 bg-brand-50 text-brand-800"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                )}
              >
                {label}
                <span
                  className={cx(
                    "num rounded-full px-1.5 text-[10px] font-bold",
                    active ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <Button
          size="sm"
          variant="secondary"
          leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
          onClick={reload}
        >
          Refresh
        </Button>
      </div>

      <Card padded={false}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search driver, DL, creator…"
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-[13px] focus:border-brand-500 focus:bg-white"
            />
          </div>
        </div>

        {loading ? (
          <p className="py-10 text-center text-[13px] text-slate-500">Loading tickets…</p>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-slate-500">
            {tickets.length === 0
              ? "No support tickets in your scope yet."
              : "No tickets match the current filters."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">Raised</th>
                  <th className="px-5 py-3">Driver</th>
                  <th className="px-5 py-3">Reason</th>
                  <th className="px-5 py-3">Creator</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right" />
                </tr>
              </thead>
              <tbody className="text-[13px]">
                {filtered.map((t) => (
                  <tr
                    key={t.id}
                    className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                    onClick={() => setSelectedId(t.id)}
                  >
                    <td className="px-5 py-3">
                      <div className="num text-slate-800">{fmtDate(t.createdAt)}</div>
                      <div className="text-[11px] text-slate-500">{fmtAgo(t.createdAt)}</div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        {t.driverSnapshot.facePhotoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={t.driverSnapshot.facePhotoUrl}
                            alt={t.driverSnapshot.fullName}
                            className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-slate-100"
                          />
                        ) : (
                          <Avatar name={t.driverSnapshot.fullName} size="sm" />
                        )}
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900">
                            {t.driverSnapshot.fullName}
                          </div>
                          <div className="font-mono text-[11px] text-slate-500">
                            {t.driverSnapshot.dlNumber}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone="warning">{REASON_LABELS[t.reason]}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      <div className="text-slate-800">{t.createdByName}</div>
                      <div className="text-[11px] text-slate-500">
                        {t.createdByRole.replace(/_/g, " ")}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={statusTone(t.status)} dot>
                        {STATUS_LABELS[t.status]}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedId(t.id);
                        }}
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selected && (
        <TicketReadPanel ticket={selected} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}

function TicketReadPanel({
  ticket,
  onClose,
}: {
  ticket: FgSupportTicket;
  onClose: () => void;
}) {
  return (
    <SlidePanel
      open
      onClose={onClose}
      title="Support ticket"
      subtitle={ticket.driverSnapshot.fullName}
      width="lg"
    >
      <div className="space-y-6">
        <div className="flex items-start gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          {ticket.driverSnapshot.facePhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ticket.driverSnapshot.facePhotoUrl}
              alt={ticket.driverSnapshot.fullName}
              className="h-16 w-16 shrink-0 rounded-xl object-cover ring-2 ring-slate-200"
            />
          ) : (
            <Avatar name={ticket.driverSnapshot.fullName} size="lg" />
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <div className="text-[15px] font-semibold text-slate-900">
              {ticket.driverSnapshot.fullName}
            </div>
            <div className="font-mono text-[12px] text-slate-600">
              {ticket.driverSnapshot.dlNumber}
            </div>
            <div className="text-[12px] text-slate-500">
              {ticket.driverSnapshot.mobile || "No mobile"}
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Badge tone="neutral">DL: {ticket.driverSnapshot.dlStatus}</Badge>
              <Badge tone="neutral">BG: {ticket.driverSnapshot.bgStatus}</Badge>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Kv label="Reason">{REASON_LABELS[ticket.reason]}</Kv>
          <Kv label="Status">
            <Badge tone={statusTone(ticket.status)} dot>
              {STATUS_LABELS[ticket.status]}
            </Badge>
          </Kv>
          <Kv label="Raised by">
            <div className="text-[13px] text-slate-800">{ticket.createdByName}</div>
            <div className="text-[11px] text-slate-500">
              {ticket.createdByRole.replace(/_/g, " ")}
            </div>
          </Kv>
          <Kv label="Notify email">
            <span className="text-[12.5px] text-slate-800">{ticket.notifyEmail}</span>
          </Kv>
          <Kv label="Raised on">
            <span className="num text-[13px]">{fmtDate(ticket.createdAt)}</span>
            <span className="ml-2 text-[11px] text-slate-500">{fmtAgo(ticket.createdAt)}</span>
          </Kv>
          <Kv label="Last updated">
            <span className="num text-[13px]">{fmtDate(ticket.updatedAt)}</span>
          </Kv>
        </div>

        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Reporter&rsquo;s description
          </div>
          <div className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-4 text-[13px] text-slate-800">
            {ticket.description}
          </div>
        </div>

        {ticket.resolutionNote && (
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Resolution
            </div>
            <div className="whitespace-pre-wrap rounded-xl border border-success-200 bg-success-50/60 p-4 text-[13px] text-slate-800">
              {ticket.resolutionNote}
            </div>
            {ticket.resolvedByName && ticket.resolvedAt && (
              <div className="mt-1 text-[11px] text-slate-500">
                by {ticket.resolvedByName} on {fmtDate(ticket.resolvedAt)}
              </div>
            )}
          </div>
        )}
      </div>
    </SlidePanel>
  );
}

function Kv({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
      <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <div className="text-[13px] text-slate-800">{children}</div>
    </div>
  );
}
