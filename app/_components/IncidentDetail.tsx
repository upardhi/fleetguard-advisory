"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, AlertTriangle, CheckCircle2, ChevronRight, MapPin, User,
  Truck, IdCard, Building2, LogIn, LogOut, Camera,
} from "lucide-react";
import { SlaBadge } from "./SlaBadge";
import { EscalationBadge } from "./EscalationBadge";
import { IncidentTimeline, type TimelineEvent } from "./IncidentTimeline";
import {
  IncidentAIOverall,
  useIncidentAISummary,
  findCaseSummary,
  CaseAISkeleton,
} from "./IncidentAISummary";

interface Incident {
  id:                 string;
  type:               string;
  description:        string;
  status:             "open" | "investigating" | "resolved" | "closed";
  severity:           string;
  assigned_to:        string | null;
  warehouse_id:       string | null;
  sla_start_at?:      string | null;
  sla_deadline:       string;
  created_at:         string;
  raised_by:          string | null;
  resolution_note:    string | null;
  escalation_level?:  number;
}

interface EntryEvent {
  id:              string;
  event_type:      string;
  vehicle_reg:     string | null;
  person_name:     string | null;
  contractor_name: string | null;
  guard_name:      string | null;
  driver_id:       string | null;
  vehicle_id:      string | null;
  photo_url:       string | null;
  status:          string;
  metadata:        Record<string, unknown> | null;
  occurred_at:     string;
}

interface ExitEvent {
  id:              string;
  event_type:      string;
  vehicle_reg:     string | null;
  person_name:     string | null;
  guard_name:      string | null;
  guard_id:        string | null;
  driver_id:       string | null;
  vehicle_id:      string | null;
  photo_url:       string | null;
  status:          string;
  metadata:        Record<string, unknown> | null;
  occurred_at:     string;
}

interface Driver {
  id:            string;
  full_name:     string;
  dl_number:     string;
  dl_expiry:     string | null;
  dl_status:     string;
  bg_status:     string;
  face_photo_url: string | null;
  contractor_id: string | null;
}

interface Vehicle {
  id:                string;
  registration_number: string;
  vehicle_type:      string;
  owner_type:        string;
  rc_expiry:         string | null;
  insurance_expiry:  string | null;
  fitness_expiry:    string | null;
  puc_expiry:        string | null;
  status:            string;
  rc_owner_name:     string | null;
  rc_manufacturer:   string | null;
  rc_vehicle_class:  string | null;
  rc_fuel_type:      string | null;
}

interface Contractor {
  id?:            string;
  name:           string;
  code?:          string | null;
  type?:          string | null;
  contact_name?:  string | null;
  contact_mobile?: string | null;
  contact_email?: string | null;
  address?:       string | null;
  city?:          string | null;
  state?:         string | null;
}

const TYPE_LABEL: Record<string, string> = {
  fraud_attempt:         "Fraud attempt",
  fake_pod:              "Fake POD",
  face_mismatch:         "Face mismatch",
  unauthorized_entry:    "Unauthorized entry",
  vehicle_noncompliance: "Vehicle non-compliance",
  driver_noncompliance:  "Driver non-compliance",
  invoice_mismatch:      "Invoice mismatch",
  theft:                 "Theft",
  criminal_record:       "Criminal Record Flagged",
  identity_mismatch:     "Identity Mismatch",
  other:                 "Other",
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { hour12: true, timeZone: "Asia/Kolkata" });
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const SEVERITY_TONE: Record<string, string> = {
  critical: "bg-danger-50 text-danger-700 ring-danger-200",
  warning:  "bg-warning-50 text-warning-700 ring-warning-200",
  info:     "bg-slate-50 text-slate-700 ring-slate-200",
};

const STATUS_TONE: Record<string, string> = {
  open:          "bg-danger-50 text-danger-700 ring-danger-200",
  investigating: "bg-warning-50 text-warning-700 ring-warning-200",
  resolved:      "bg-success-50 text-success-700 ring-success-200",
  closed:        "bg-slate-50 text-slate-700 ring-slate-200",
};

const DL_STATUS_TONE: Record<string, string> = {
  clear:    "bg-success-50 text-success-700 ring-success-200",
  expiring: "bg-warning-50 text-warning-700 ring-warning-200",
  expired:  "bg-danger-50 text-danger-700 ring-danger-200",
  blocked:  "bg-danger-50 text-danger-700 ring-danger-200",
};

const BG_STATUS_TONE: Record<string, string> = {
  clear:   "bg-success-50 text-success-700 ring-success-200",
  pending: "bg-warning-50 text-warning-700 ring-warning-200",
  flagged: "bg-danger-50 text-danger-700 ring-danger-200",
  failed:  "bg-slate-50 text-slate-700 ring-slate-200",
};

const VEHICLE_STATUS_TONE: Record<string, string> = {
  clear:    "bg-success-50 text-success-700 ring-success-200",
  expiring: "bg-warning-50 text-warning-700 ring-warning-200",
  expired:  "bg-danger-50 text-danger-700 ring-danger-200",
  blocked:  "bg-danger-50 text-danger-700 ring-danger-200",
};

function expiryTone(iso: string | null | undefined): string {
  if (!iso) return "text-slate-400";
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  if (days < 0) return "text-danger-700 font-semibold";
  if (days <= 30) return "text-warning-700 font-semibold";
  return "text-slate-700";
}

function expiryLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  const d = fmtDate(iso);
  if (days < 0) return `${d} (expired)`;
  if (days <= 30) return `${d} (${days}d left)`;
  return d;
}

export function IncidentDetail({
  incidentId,
  backHref,
  portal,
}: {
  incidentId: string;
  backHref:   string;
  portal:     "manager" | "cso";
}) {
  const router = useRouter();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [warehouseName, setWarehouseName] = useState<string>("");
  const [assigneeName, setAssigneeName] = useState<string>("");
  const [entryEvent, setEntryEvent]   = useState<EntryEvent | null>(null);
  const [exitEvent, setExitEvent]     = useState<ExitEvent | null>(null);
  const [driver, setDriver]           = useState<Driver | null>(null);
  const [vehicle, setVehicle]         = useState<Vehicle | null>(null);
  const [contractor, setContractor]   = useState<Contractor | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // AI-generated per-case + overall driver-risk summary. Shared between
  // the Overall card (rendered near the top) and the per-case prose
  // injected inside each crime-check case card below.
  const ai = useIncidentAISummary(incident?.id ?? null);

  const [resolutionNote, setResolutionNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);

  // enlarged photo modal
  const [enlargedPhoto, setEnlargedPhoto] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/v2/incidents/${incidentId}`, { credentials: "include" });
      if (!res.ok) {
        setErr(`Failed to load incident (${res.status})`);
        return;
      }
      const data = await res.json() as {
        incident:   Incident;
        events:     TimelineEvent[];
        entryEvent: EntryEvent | null;
        exitEvent:  ExitEvent | null;
        driver:     Driver | null;
        vehicle:    Vehicle | null;
        contractor: Contractor | null;
      };
      setIncident(data.incident);
      setEvents(data.events ?? []);
      setEntryEvent(data.entryEvent ?? null);
      setExitEvent(data.exitEvent ?? null);
      setDriver(data.driver ?? null);
      setVehicle(data.vehicle ?? null);
      setContractor(data.contractor ?? null);

      const tasks: Promise<void>[] = [];
      if (data.incident.warehouse_id) {
        tasks.push(
          fetch(`/api/v2/warehouses/${data.incident.warehouse_id}`, { credentials: "include" })
            .then((r) => r.ok ? r.json() : null)
            .then((d) => { if (d?.warehouse?.name) setWarehouseName(d.warehouse.name); })
            .catch(() => undefined),
        );
      }
      if (data.incident.assigned_to) {
        tasks.push(
          fetch(`/api/v2/users/${data.incident.assigned_to}`, { credentials: "include" })
            .then((r) => r.ok ? r.json() : null)
            .then((d) => { if (d?.user?.full_name) setAssigneeName(d.user.full_name); })
            .catch(() => undefined),
        );
      }
      await Promise.all(tasks);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load();   }, [incidentId]);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setActionErr(null);
    try {
      const res = await fetch(`/api/v2/incidents/${incidentId}`, {
        method:      "PATCH",
        headers:     { "Content-Type": "application/json" },
        credentials: "include",
        body:        JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; legalNext?: string[] };
      if (!res.ok) {
        setActionErr(data.error ?? `Action failed (${res.status})`);
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center text-[13px] text-slate-500">Loading incident…</div>;
  }
  if (err || !incident) {
    return <div className="p-8 text-[13px] text-danger-700">{err ?? "Incident not found."}</div>;
  }

  const isClosed            = incident.status === "resolved" || incident.status === "closed";
  const canStartInvestigation = incident.status === "open";
  const canResolve            = incident.status === "open" || incident.status === "investigating";

  const meta = entryEvent?.metadata ?? null;
  const dlImageUrl     = (meta?.dlImageUrl as string | null) ?? null;
  const dlVerifyData   = (meta?.dlVerifyData as Record<string, unknown> | null) ?? null;
  const crimeData      = (meta?.crimeCheckData as Record<string, unknown> | null) ?? null;
  const overrideReason = (meta?.overrideReason as string | null) ?? null;

  return (
    <>
      {/* Photo lightbox */}
      {enlargedPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setEnlargedPhoto(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={enlargedPhoto}
            alt="Full size"
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          />
        </div>
      )}

      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-6">
        <Link
          href={backHref}
          className="inline-flex w-fit items-center gap-1 text-[12px] text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-3 w-3" /> Back to incidents
        </Link>

        {/* Header */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[20px] font-semibold text-slate-900">
            {TYPE_LABEL[incident.type] ?? incident.type}
          </h1>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${SEVERITY_TONE[incident.severity] ?? SEVERITY_TONE.warning}`}>
            {incident.severity}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${STATUS_TONE[incident.status]}`}>
            {incident.status}
          </span>
          {!isClosed && (
            <SlaBadge
              createdAt={incident.created_at}
              slaStartAt={incident.sla_start_at}
              slaDeadline={incident.sla_deadline}
            />
          )}
          <EscalationBadge level={incident.escalation_level ?? 0} />
        </div>

        {/* Description */}
        {/* <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-1 text-[10.5px] uppercase tracking-wider text-slate-500">Description</div>
          <p className="text-[13.5px] text-slate-800">{incident.description}</p>
        </div> */}


        {/* Meta cards */}
        <div className="grid gap-3 sm:grid-cols-3">
          <MetaCard icon={MapPin}       label="Warehouse"   value={warehouseName || incident.warehouse_id || "—"} />
          <MetaCard icon={User}         label="Assigned to" value={assigneeName || (incident.assigned_to ? "Loading…" : "Unassigned")} />
          <MetaCard icon={AlertTriangle} label="Created · SLA" value={`${fmt(incident.created_at)} → ${fmt(incident.sla_deadline)}`} />
        </div>

        {/* ── Gate Entry ──────────────────────────────────────────────── */}
        {entryEvent && (
          <Section icon={LogIn} title="Gate Entry" accent="blue">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Field label="Timestamp"    value={fmt(entryEvent.occurred_at)} />
                <Field label="Guard"        value={entryEvent.guard_name ?? "—"} />
                <Field label="Vehicle reg"  value={entryEvent.vehicle_reg ?? "—"} />
                <Field label="Driver name"  value={entryEvent.person_name ?? driver?.full_name ?? "—"} />
                <Field label="Event type"   value={entryEvent.event_type.replace(/_/g, " ")} />
                {overrideReason && (
                  <div className="rounded-md bg-warning-50 px-3 py-2 ring-1 ring-warning-200">
                    <div className="text-[10px] uppercase tracking-wider text-warning-600 mb-0.5">Override reason</div>
                    <div className="text-[12.5px] text-warning-800">{overrideReason}</div>
                  </div>
                )}
              </div>
              {entryEvent.photo_url && (
                <PhotoThumb label="Entry photo" url={entryEvent.photo_url} onEnlarge={setEnlargedPhoto} />
              )}
            </div>
          </Section>
        )}

        {/* ── Gate Exit ───────────────────────────────────────────────── */}
        {exitEvent ? (
          <Section icon={LogOut} title="Gate Exit" accent="green">
            {(() => {
              const exitMeta      = exitEvent.metadata ?? null;
              const exitDlImg     = (exitMeta?.dlImageUrl as string | null) ?? null;
              const exitFaceImg   = (exitMeta?.facePhotoUrl as string | null)
                                 ?? (exitMeta?.exitFacePhotoUrl as string | null) ?? null;
              const exitDlVerify  = (exitMeta?.dlVerifyData as Record<string, unknown> | null) ?? null;
              const faceScore     = (exitMeta?.faceMatchScore as number | null)
                                 ?? (exitMeta?.faceScore as number | null) ?? null;
              const exitOverride  = (exitMeta?.overrideReason as string | null) ?? null;
              const mismatchReason = (exitMeta?.mismatchReason as string | null) ?? null;
              const exitDlNumber  = (exitMeta?.dlNumber as string | null) ?? null;
              const exitDob       = (exitMeta?.driverDob as string | null) ?? null;

              // time inside compound
              const durationMs  = entryEvent
                ? new Date(exitEvent.occurred_at).getTime() - new Date(entryEvent.occurred_at).getTime()
                : null;
              const durationStr = durationMs !== null
                ? (() => {
                    const totalMin = Math.round(durationMs / 60000);
                    const h = Math.floor(totalMin / 60);
                    const m = totalMin % 60;
                    return h > 0 ? `${h}h ${m}m` : `${m}m`;
                  })()
                : null;

              return (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Field label="Timestamp"   value={fmt(exitEvent.occurred_at)} />
                      <Field label="Guard"        value={exitEvent.guard_name ?? "—"} />
                      <Field label="Event type"   value={exitEvent.event_type.replace(/_/g, " ")} />
                      <Field label="Vehicle reg"  value={exitEvent.vehicle_reg ?? entryEvent?.vehicle_reg ?? "—"} mono />
                      <Field label="Driver name"  value={exitEvent.person_name ?? driver?.full_name ?? "—"} />
                      {exitDlNumber && <Field label="DL number" value={exitDlNumber} mono />}
                      {exitDob     && <Field label="DOB (OCR)"  value={exitDob} />}
                      {durationStr && <Field label="Time inside" value={durationStr} />}
                      {faceScore !== null && (
                        <div className="flex items-center gap-2">
                          <span className="text-[10.5px] uppercase tracking-wider text-slate-500 w-24 shrink-0">Face match</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ${
                            faceScore >= 80 ? "bg-success-50 text-success-700 ring-success-200"
                            : faceScore >= 60 ? "bg-warning-50 text-warning-700 ring-warning-200"
                            : "bg-danger-50 text-danger-700 ring-danger-200"
                          }`}>
                            {faceScore}%
                          </span>
                        </div>
                      )}
                      {mismatchReason && (
                        <div className="rounded-md bg-danger-50 px-3 py-2 ring-1 ring-danger-200">
                          <div className="text-[10px] uppercase tracking-wider text-danger-600 mb-0.5">Mismatch reason</div>
                          <div className="text-[12.5px] text-danger-800">{mismatchReason}</div>
                        </div>
                      )}
                      {exitOverride && (
                        <div className="rounded-md bg-warning-50 px-3 py-2 ring-1 ring-warning-200">
                          <div className="text-[10px] uppercase tracking-wider text-warning-600 mb-0.5">Override reason</div>
                          <div className="text-[12.5px] text-warning-800">{exitOverride}</div>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-3 flex-wrap">
                      {exitEvent.photo_url && (
                        <PhotoThumb label="Exit photo" url={exitEvent.photo_url} onEnlarge={setEnlargedPhoto} />
                      )}
                      {exitFaceImg && exitFaceImg !== exitEvent.photo_url && (
                        <PhotoThumb label="Face at exit" url={exitFaceImg} onEnlarge={setEnlargedPhoto} />
                      )}
                      {exitDlImg && (
                        <PhotoThumb label="DL at exit" url={exitDlImg} onEnlarge={setEnlargedPhoto} />
                      )}
                    </div>
                  </div>

                  {/* Exit DL verification */}
                  {exitDlVerify && (
                    <div className="mt-4 rounded-md border border-slate-100 bg-slate-50 p-3">
                      <div className="mb-2 text-[10.5px] uppercase tracking-wider text-slate-500">DL verification at exit</div>
                      <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                        {([
                          ["DL number", (exitDlVerify.data as Record<string, unknown>)?.dl_number as string ?? (exitDlVerify.dlNumber as string)],
                          ["Name",      (exitDlVerify.data as Record<string, unknown>)?.name as string],
                          ["DOB",       (exitDlVerify.data as Record<string, unknown>)?.dob as string],
                          ["State",     (exitDlVerify.data as Record<string, unknown>)?.state as string],
                          ["NT valid",  (exitDlVerify.data as Record<string, unknown>)?.nt_validity as string],
                          ["T valid",   (exitDlVerify.data as Record<string, unknown>)?.t_validity as string],
                          ["Captured",  exitDlVerify.capturedAt ? fmt(exitDlVerify.capturedAt as string) : null],
                        ] as [string, string | null | undefined][]).map(([lbl, val]) =>
                          val ? <SmallField key={lbl} label={lbl} value={String(val)} /> : null,
                        )}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </Section>
        ) : entryEvent ? (
          <Section icon={LogOut} title="Gate Exit" accent="slate">
            <p className="text-[12.5px] text-slate-500 italic">No exit recorded — vehicle/driver may still be inside.</p>
          </Section>
        ) : null}

        {/* ── Driver ──────────────────────────────────────────────────── */}
        {driver && (
          <Section icon={IdCard} title="Driver" accent="indigo">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Field label="Full name"   value={driver.full_name} />
                <Field label="DL number"   value={driver.dl_number} mono />
                <div className="flex items-center gap-2">
                  <span className="text-[10.5px] uppercase tracking-wider text-slate-500 w-24 shrink-0">DL status</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ${DL_STATUS_TONE[driver.dl_status] ?? DL_STATUS_TONE.blocked}`}>
                    {driver.dl_status}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10.5px] uppercase tracking-wider text-slate-500 w-24 shrink-0">Background</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ${BG_STATUS_TONE[driver.bg_status] ?? BG_STATUS_TONE.pending}`}>
                    {driver.bg_status}
                  </span>
                </div>
                <Field label="DL expiry"   value={expiryLabel(driver.dl_expiry)} valueClassName={expiryTone(driver.dl_expiry)} />
              </div>
              <div className="flex gap-3">
                {driver.face_photo_url && (
                  <PhotoThumb label="Face photo" url={driver.face_photo_url} onEnlarge={setEnlargedPhoto} />
                )}
                {dlImageUrl && (
                  <PhotoThumb label="DL photo" url={dlImageUrl} onEnlarge={setEnlargedPhoto} />
                )}
              </div>
            </div>

            {/* DL Verify data */}
            {dlVerifyData && (
              <div className="mt-4 rounded-md border border-slate-100 bg-slate-50 p-3">
                <div className="mb-2 text-[10.5px] uppercase tracking-wider text-slate-500">DL verification result</div>
                <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                  {([
                    ["Provider",  dlVerifyData.provider as string],
                    ["Captured",  dlVerifyData.capturedAt ? fmt(dlVerifyData.capturedAt as string) : null],
                    ["DOB",       (dlVerifyData.data as Record<string, unknown>)?.dob as string],
                    ["Name",      (dlVerifyData.data as Record<string, unknown>)?.name as string],
                    ["State",     (dlVerifyData.data as Record<string, unknown>)?.state as string],
                    ["NT valid",  (dlVerifyData.data as Record<string, unknown>)?.nt_validity as string],
                    ["T valid",   (dlVerifyData.data as Record<string, unknown>)?.t_validity as string],
                  ] as [string, string | null | undefined][]).map(([lbl, val]) =>
                    val ? <SmallField key={lbl} label={lbl} value={String(val)} /> : null,
                  )}
                </div>
              </div>
            )}

            {/* Crime check */}
            {crimeData && (
              <div className={`mt-3 rounded-md border p-3 ${
                (() => {
                  const pd = crimeData.pollData as Record<string, unknown> | null;
                  const cc = Array.isArray(pd?.caseDetails) ? (pd!.caseDetails as Record<string, unknown>[]) : [];
                  return cc.length > 0 ? "border-danger-200 bg-danger-50" : "border-slate-100 bg-slate-50";
                })()
              }`}>
                <div className="mb-2 text-[10.5px] uppercase tracking-wider text-slate-500">Background / crime check</div>
                {(() => {
                  const pd = crimeData.pollData as Record<string, unknown> | null;
                  const cases = Array.isArray(pd?.caseDetails) ? (pd!.caseDetails as Record<string, unknown>[]) : [];
                  const total       = cases.length;
                  const convictions = cases.filter(c => String(c.caseStatus ?? "").toLowerCase() === "convicted").length;
                  const pending     = cases.filter(c => String(c.caseStatus ?? "").toLowerCase() === "pending").length;
                  const criminal    = cases.filter(c => String(c.caseType ?? c.caseTypeName ?? "").toLowerCase() === "criminal").length;
                  const civil       = cases.filter(c => String(c.caseType ?? c.caseTypeName ?? "").toLowerCase() === "civil").length;
                  return total > 0 ? (
                    <div className="mb-3 flex flex-wrap gap-2">
                      <StatPill label="Total cases"   value={total}       tone="danger" />
                      <StatPill label="Pending"        value={pending}     tone={pending > 0 ? "warning" : "neutral"} />
                      <StatPill label="Convictions"    value={convictions} tone={convictions > 0 ? "danger" : "neutral"} />
                      <StatPill label="Criminal"       value={criminal}    tone={criminal > 0 ? "danger" : "neutral"} />
                      <StatPill label="Civil"          value={civil}       tone="neutral" />
                    </div>
                  ) : null;
                })()}
                <div className="grid gap-x-6 gap-y-1 sm:grid-cols-3">
                  {/* <SmallField label="Provider"   value={(crimeData.provider as string) ?? "—"} /> */}
                  {/* <SmallField label="Case ID"    value={(crimeData.caseId as string) ?? "—"} /> */}
                  <SmallField label="Checked at" value={crimeData.capturedAt ? fmt(crimeData.capturedAt as string) : "—"} />
                </div>
                {(() => {
                  const pollData = crimeData.pollData as Record<string, unknown> | null;
                  const cases = Array.isArray(pollData?.caseDetails)
                    ? (pollData!.caseDetails as Record<string, unknown>[])
                    : null;
                  if (!cases?.length) return null;
                  return (
                    <div className="mt-2 space-y-2">
                      {cases.map((c, i) => (
                        <div key={i} className="rounded bg-white/70 px-3 py-2 text-[11.5px] text-slate-800 ring-1 ring-slate-200">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold capitalize">
                              {String(c.caseTypeName ?? c.caseType ?? "Case")}
                            </span>
                            {!!c.caseStatus && (
                              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${
                                String(c.caseStatus).toLowerCase() === "pending"
                                  ? "bg-warning-50 text-warning-700 ring-warning-200"
                                  : "bg-slate-100 text-slate-600 ring-slate-200"
                              }`}>
                                {String(c.caseStatus)}
                              </span>
                            )}
                            {!!c.severity && (
                              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${
                                String(c.severity).toLowerCase() === "high"
                                  ? "bg-danger-50 text-danger-700 ring-danger-200"
                                  : String(c.severity).toLowerCase() === "medium"
                                  ? "bg-warning-50 text-warning-700 ring-warning-200"
                                  : "bg-slate-50 text-slate-600 ring-slate-200"
                              }`}>
                                {String(c.severity)}
                              </span>
                            )}
                          
                          </div>
                          {!!c.courtName && (
                            <div className="mt-0.5 text-[11px] text-slate-500">{String(c.courtName)}</div>
                          )}
                          {!!c.caseYear && (
                            <div className="mt-0.5 text-[10.5px] text-slate-400">
                              Filed {String(c.caseYear)}{!!c.underSection && ` · ${String(c.underSection)}`}
                            </div>
                          )}
                          {!!c.respondent && (
                            <div className="mt-0.5 text-[10.5px] text-slate-500">
                              Respondent: {String(c.respondent)}
                            </div>
                          )}
                          {/* AI-generated plain-English summary for this case.
                              Shows a shimmer while the API call is in flight
                              and no data has arrived yet for this row. */}
                          {(() => {
                            const aic = findCaseSummary(ai.data, i);
                            if (!aic) {
                              // Still loading the AI summary — show a per-case
                              // shimmer in the exact same slot so the manager
                              // sees that something is being generated.
                              if (ai.loading) return <CaseAISkeleton />;
                              return null;
                            }
                            const riskCls = aic.riskLevel.toLowerCase() === "high"
                              ? "bg-danger-50 text-danger-700 ring-danger-200"
                              : aic.riskLevel.toLowerCase() === "medium"
                              ? "bg-warning-50 text-warning-700 ring-warning-200"
                              : "bg-emerald-50 text-emerald-700 ring-emerald-200";
                            return (
                              <div className="mt-2 rounded-md bg-blue-50/60 px-2.5 py-2 ring-1 ring-blue-100">
                                <div className="mb-0.5 flex items-center gap-1.5">
                                  <span className="inline-flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-wider text-blue-700">
                                    <span className="h-1 w-1 rounded-full bg-blue-500" />
                                    Case Summary
                                  </span>
                                  <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold ring-1 ${riskCls}`}>
                                    {aic.riskLevel} Risk
                                  </span>
                                </div>
                                <p className="text-[11.5px] leading-snug text-slate-700">
                                  {aic.summary}
                                </p>
                              </div>
                            );
                          })()}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}
          </Section>
        )}

        {/* ── Vehicle ─────────────────────────────────────────────────── */}
        {vehicle && (
          <Section icon={Truck} title="Vehicle" accent="amber">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Field label="Registration" value={vehicle.registration_number} mono />
                <Field label="Type"         value={vehicle.vehicle_type ?? "—"} />
                <Field label="Owner type"   value={vehicle.owner_type ?? "—"} />
                {vehicle.rc_owner_name    && <Field label="RC owner"    value={vehicle.rc_owner_name} />}
                {vehicle.rc_manufacturer  && <Field label="Manufacturer" value={vehicle.rc_manufacturer} />}
                {vehicle.rc_vehicle_class && <Field label="Class"        value={vehicle.rc_vehicle_class} />}
                {vehicle.rc_fuel_type     && <Field label="Fuel type"    value={vehicle.rc_fuel_type} />}
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10.5px] uppercase tracking-wider text-slate-500 w-24 shrink-0">Status</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ${VEHICLE_STATUS_TONE[vehicle.status] ?? VEHICLE_STATUS_TONE.clear}`}>
                    {vehicle.status}
                  </span>
                </div>
                <Field label="RC expiry"        value={expiryLabel(vehicle.rc_expiry)}        valueClassName={expiryTone(vehicle.rc_expiry)} />
                <Field label="Insurance expiry" value={expiryLabel(vehicle.insurance_expiry)} valueClassName={expiryTone(vehicle.insurance_expiry)} />
                <Field label="Fitness expiry"   value={expiryLabel(vehicle.fitness_expiry)}   valueClassName={expiryTone(vehicle.fitness_expiry)} />
                <Field label="PUC expiry"       value={expiryLabel(vehicle.puc_expiry)}       valueClassName={expiryTone(vehicle.puc_expiry)} />
              </div>
            </div>
          </Section>
        )}

        {/* ── Service Provider ────────────────────────────────────────── */}
        {contractor && (
          <Section icon={Building2} title="Service Provider" accent="purple">
            <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
              <Field label="Name"    value={contractor.name} />
              {contractor.code         && <Field label="Code"    value={contractor.code} mono />}
              {contractor.type         && <Field label="Type"    value={contractor.type} />}
              {contractor.contact_name  && <Field label="Contact" value={contractor.contact_name} />}
              {contractor.contact_mobile && <Field label="Mobile"  value={contractor.contact_mobile} mono />}
              {contractor.contact_email  && <Field label="Email"   value={contractor.contact_email} />}
              {contractor.city           && <Field label="City"    value={[contractor.city, contractor.state].filter(Boolean).join(", ")} />}
              {contractor.address        && <Field label="Address" value={contractor.address} />}
            </div>
          </Section>
        )}

                {/* AI-generated overall driver-risk summary. Per-case prose is
            injected inside each card in the Background / crime check
            section further down. */}
        <IncidentAIOverall
          data={ai.data}
          loading={ai.loading}
          err={ai.err}
          onRefresh={() => ai.refresh(true)}
        />

        {/* Resolution */}
        {!isClosed && (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center gap-2 text-[12.5px] font-semibold text-slate-800">
              <CheckCircle2 className="h-4 w-4 text-success-700" />
              Mark progress
            </div>
            <textarea
              placeholder="Required to resolve: explain what was done (≥10 characters)…"
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-slate-300 bg-white p-2 text-[13px] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
            {actionErr && (
              <div className="mt-2 rounded-md bg-danger-50 px-3 py-2 text-[12px] text-danger-700 ring-1 ring-danger-200">
                {actionErr}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {canStartInvestigation && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => patch({ status: "investigating" })}
                  className="rounded-md border border-warning-300 bg-warning-50 px-3 py-1.5 text-[12.5px] font-semibold text-warning-700 hover:bg-warning-100 disabled:opacity-50"
                >
                  Start investigation
                </button>
              )}
              {canResolve && (
                <button
                  type="button"
                  disabled={busy || resolutionNote.trim().length < 10}
                  onClick={() => patch({ status: "resolved", resolutionNote: resolutionNote.trim() })}
                  className="rounded-md border border-success-300 bg-success-50 px-3 py-1.5 text-[12.5px] font-semibold text-success-700 hover:bg-success-100 disabled:opacity-50"
                >
                  Resolve incident
                </button>
              )}
              {portal === "cso" && incident.status === "resolved" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => patch({ status: "closed", resolutionNote: resolutionNote.trim() || incident.resolution_note || "Closed by CSO." })}
                  className="rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  Close
                </button>
              )}
            </div>
            {canResolve && (
              <p className="mt-2 text-[11px] text-slate-500">
                Resolving stops the SLA clock and clears all alerts linked to this incident.
              </p>
            )}
          </div>
        )}

        {/* Resolved summary */}
        {isClosed && incident.resolution_note && (
          <div className="rounded-xl border border-success-200 bg-success-50/60 p-4">
            <div className="mb-1 text-[10.5px] uppercase tracking-wider text-success-700">
              {incident.status === "resolved" ? "Resolution note" : "Closing note"}
            </div>
            <p className="text-[13px] text-slate-800">{incident.resolution_note}</p>
          </div>
        )}

        {/* Timeline */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2 text-[12.5px] font-semibold text-slate-800">
            <ChevronRight className="h-4 w-4 text-slate-500" />
            Activity timeline
            <span className="text-[11px] font-normal text-slate-500">({events.length} {events.length === 1 ? "event" : "events"})</span>
          </div>
          <IncidentTimeline events={events} />
        </div>

        <button
          type="button"
          onClick={() => router.refresh()}
          className="text-[11px] text-slate-400 hover:text-slate-600 self-start"
        >
          Reload
        </button>
      </div>
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

const ACCENT: Record<string, { border: string; icon: string; title: string }> = {
  blue:   { border: "border-blue-200",   icon: "text-blue-500",   title: "text-blue-800" },
  green:  { border: "border-success-200", icon: "text-success-600", title: "text-success-800" },
  indigo: { border: "border-indigo-200",  icon: "text-indigo-500",  title: "text-indigo-800" },
  amber:  { border: "border-amber-200",   icon: "text-amber-600",   title: "text-amber-800" },
  purple: { border: "border-purple-200",  icon: "text-purple-500",  title: "text-purple-800" },
  slate:  { border: "border-slate-200",   icon: "text-slate-400",   title: "text-slate-600" },
};

function Section({
  icon: Icon,
  title,
  accent = "slate",
  children,
}: {
  icon:     typeof LogIn;
  title:    string;
  accent?:  keyof typeof ACCENT;
  children: React.ReactNode;
}) {
  const tone = ACCENT[accent] ?? ACCENT.slate;
  return (
    <div className={`rounded-xl border bg-white p-4 ${tone.border}`}>
      <div className={`mb-3 flex items-center gap-2 text-[12.5px] font-semibold ${tone.title}`}>
        <Icon className={`h-4 w-4 ${tone.icon}`} />
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  mono = false,
  valueClassName,
}: {
  label:          string;
  value:          string;
  mono?:          boolean;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 w-24 shrink-0 text-[10.5px] uppercase tracking-wider text-slate-500">{label}</span>
      <span className={`text-[13px] break-all ${mono ? "font-mono" : ""} ${valueClassName ?? "text-slate-800"}`}>
        {value}
      </span>
    </div>
  );
}

function SmallField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9.5px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-[12px] text-slate-700">{value}</div>
    </div>
  );
}

function PhotoThumb({
  label,
  url,
  onEnlarge,
}: {
  label:     string;
  url:       string;
  onEnlarge: (url: string) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1">
        <Camera className="h-3 w-3" /> {label}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={label}
        onClick={() => onEnlarge(url)}
        className="h-32 w-28 cursor-pointer rounded-lg object-cover ring-1 ring-slate-200 hover:ring-2 hover:ring-brand-400 transition-all"
      />
      <button
        type="button"
        onClick={() => onEnlarge(url)}
        className="text-[10px] text-brand-600 hover:underline"
      >
        View full size
      </button>
    </div>
  );
}

function MetaCard({
  icon: Icon,
  label,
  value,
}: {
  icon:  typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-slate-500">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="text-[13px] text-slate-800 break-words">{value}</div>
    </div>
  );
}

const STAT_TONE: Record<string, string> = {
  danger:  "bg-danger-50 text-danger-700 ring-danger-200",
  warning: "bg-warning-50 text-warning-700 ring-warning-200",
  neutral: "bg-slate-100 text-slate-600 ring-slate-200",
};

function StatPill({ label, value, tone }: { label: string; value: number; tone: keyof typeof STAT_TONE }) {
  return (
    <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${STAT_TONE[tone]}`}>
      <span className="text-[13px] font-bold">{value}</span>
      <span className="font-normal opacity-80">{label}</span>
    </div>
  );
}
