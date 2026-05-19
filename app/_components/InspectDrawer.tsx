"use client";

/**
 * InspectDrawer — driver-entry debug view.
 *
 * Renders a slide-out panel for a single gate-entry event so platform owners
 * can audit the raw provider responses captured at gate time. Shows parsed
 * DL + crime data alongside collapsible raw payloads, each with a one-click
 * "Copy original response" button so the source JSON can be diffed against
 * the parsed view or shared with a vendor for support tickets.
 */

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  ClipboardCopy,
  FileText,
  IdCard,
  Image as ImageIcon,
  Link as LinkIcon,
  ShieldAlert,
  ShieldCheck,
  User,
} from "lucide-react";
import { SlidePanel } from "./SlidePanel";
import { Badge } from "./Badge";
import type { FgGateEvent } from "../_services/gateEventService";
import { translateCrimeCheckResponse, type CrimeCase } from "../_services/crimeCheckService";
import {
  translateDlResponse,
  validateDl,
  type DlVerifyResult,
  type DlValidationResult,
} from "../_services/dlVerifyService";
import { fmtDateTime, cx } from "../_lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  event: FgGateEvent | null;
}

export function InspectDrawer({ open, onClose, event }: Props) {
  return (
    <SlidePanel
      open={open}
      onClose={onClose}
      title="Inspect entry"
      subtitle="Raw DL + crime API payloads captured at the gate"
      width="lg"
    >
      {!event ? (
        <p className="text-[13px] text-slate-500">No entry event selected.</p>
      ) : (
        <DriverEntryInspect event={event} />
      )}
    </SlidePanel>
  );
}

function DriverEntryInspect({ event }: { event: FgGateEvent }) {
  // ── Parse DL payload ────────────────────────────────────────────────────────
  let dlNormalized: DlVerifyResult | null = null;
  let dlValidation: DlValidationResult | null = null;
  let dlParseError: string | null = null;
  if (event.dlVerifyData?.provider && event.dlVerifyData.data) {
    try {
      dlNormalized = translateDlResponse(event.dlVerifyData.provider, event.dlVerifyData.data);
      dlValidation = validateDl(dlNormalized, "");
    } catch (err: unknown) {
      dlParseError = err instanceof Error ? err.message : "Unknown DL parse error";
    }
  }

  // ── Parse crime payload ─────────────────────────────────────────────────────
  let crimeCases: CrimeCase[] = [];
  let crimeTotal = 0;
  let crimeParseError: string | null = null;
  if (event.crimeCheckData?.provider && event.crimeCheckData.pollData) {
    try {
      const result = translateCrimeCheckResponse(
        event.crimeCheckData.provider,
        event.crimeCheckData.pollData,
      );
      crimeCases = result.cases;
      crimeTotal = result.total;
    } catch (err: unknown) {
      crimeParseError = err instanceof Error ? err.message : "Unknown crime parse error";
    }
  }

  return (
    <div className="space-y-5">
      {/* Identity / event */}
      <Section icon={User} title="Entry event">
        <div className="space-y-1 text-[12.5px]">
          <Field label="Event ID" value={event.id} mono copyable />
          <Field label="Event type" value={event.eventType} mono />
          <Field label="Time" value={fmtDateTime(event.time)} />
          <Field label="Status" value={event.status} />
          <Field label="Driver" value={event.personName ?? "—"} />
          <Field label="Driver ID" value={event.driverId ?? "—"} mono copyable={Boolean(event.driverId)} />
          <Field label="Vehicle" value={event.vehicleReg ?? "—"} mono />
          <Field label="Trip ID" value={event.tripId ?? "—"} mono copyable={Boolean(event.tripId)} />
          <Field label="Service Provider" value={event.contractorName ?? "—"} />
          <Field label="Guard" value={`${event.guardName} (${event.guardUid})`} />
          <Field label="Warehouse ID" value={event.warehouseId} mono copyable />
          {event.overrideReason && (
            <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11.5px] text-amber-900">
              <span className="font-semibold">Override applied:</span> {event.overrideReason}
              {event.overriddenByUid && (
                <span className="block font-mono text-[10.5px] text-amber-700">by {event.overriddenByUid}</span>
              )}
            </div>
          )}
        </div>
        {(event.photoUrl || event.dlImageUrl) && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {event.photoUrl && <ImageThumb label="Driver photo at entry" url={event.photoUrl} />}
            {event.dlImageUrl && <ImageThumb label="DL card photo (OCR source)" url={event.dlImageUrl} />}
          </div>
        )}
      </Section>

      {/* DL */}
      <Section icon={IdCard} title="DL verification">
        {!event.dlVerifyData ? (
          <p className="text-[12.5px] text-slate-500">No DL verification data captured at entry.</p>
        ) : dlParseError ? (
          <ParseError message={dlParseError} provider={event.dlVerifyData.provider} />
        ) : dlNormalized && dlValidation ? (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge tone={dlValidation.blocking ? "danger" : "success"} dot>
                {dlValidation.label}
              </Badge>
              <span className="text-[11px] text-slate-500">
                via <span className="font-mono">{event.dlVerifyData.provider}</span> ·{" "}
                {fmtDateTime(new Date(event.dlVerifyData.capturedAt))}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-1 text-[12.5px]">
              <Field label="DL number" value={dlNormalized.dlNumber} mono copyable />
              <Field label="Holder" value={dlNormalized.name} />
              <Field label="DOB" value={dlNormalized.dob} />
              <Field label="Issuing RTO" value={dlNormalized.issuingRtoName} />
              <Field
                label="Transport validity"
                value={`${dlNormalized.validity?.transport?.from || "Not Available"} → ${dlNormalized.validity?.transport?.to || "Not Available"}`}
              />
              <Field
                label="Non-transport validity"
                value={`${dlNormalized.validity?.nonTransport?.from || "Not Available"} → ${dlNormalized.validity?.nonTransport?.to || "Not Available"}`}
              />
              <Field label="Vehicle classes" value={dlNormalized.classOfVehicles?.join(", ") || "—"} />
              <Field label="Issued on" value={dlNormalized.dateOfIssue || "—"} />
              <Field label="Provider status" value={dlNormalized.status || "—"} />
            </div>
            {dlValidation.detail && (
              <p className="mt-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-[11.5px] text-slate-600">
                {dlValidation.detail}
              </p>
            )}
            <RawPayload label="DL provider response" payload={event.dlVerifyData.data} />
          </>
        ) : null}
      </Section>

      {/* Crime */}
      <Section icon={ShieldAlert} title={`Background check (${crimeTotal} cases)`}>
        {!event.crimeCheckData ? (
          <p className="text-[12.5px] text-slate-500">No background check captured at entry.</p>
        ) : !event.crimeCheckData.pollData ? (
          <p className="text-[12.5px] text-amber-700">
            Background check initiated but never returned a poll result —
            check provider <span className="font-mono">{event.crimeCheckData.provider}</span> for
            case ID <span className="font-mono">{event.crimeCheckData.caseId}</span>.
          </p>
        ) : crimeParseError ? (
          <ParseError message={crimeParseError} provider={event.crimeCheckData.provider} />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <span>
                via <span className="font-mono">{event.crimeCheckData.provider}</span> ·{" "}
                {fmtDateTime(new Date(event.crimeCheckData.capturedAt))}
              </span>
              <span>· case ID <span className="font-mono">{event.crimeCheckData.caseId}</span></span>
            </div>
            {crimeCases.length === 0 ? (
              <div className="flex items-center gap-2 rounded-md border border-success-100 bg-success-50/60 px-3 py-2 text-[12.5px] text-success-800">
                <ShieldCheck className="h-3.5 w-3.5" /> No cases on record.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
                {crimeCases.map((c) => (
                  <li key={c.id || c.cnr || c.caseNo} className="px-3 py-2">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge tone={c.caseCategory?.toLowerCase() === "criminal" ? "danger" : "warning"} dot>
                        {c.caseCategory || "—"}
                      </Badge>
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-800">
                        {c.caseStatus || "status unknown"}
                      </code>
                      {c.algoRisk && <span className="text-[11px] text-slate-500">algo: {c.algoRisk}</span>}
                    </div>
                    <div className="text-[12px] text-slate-700">
                      {c.caseNo || c.cnr} · {c.courtName || c.distName || "—"}
                      {c.stateName ? `, ${c.stateName}` : ""}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      {c.underActs && <>Under: {c.underActs} </>}
                      {c.underSections && <>· Sections: {c.underSections}</>}
                    </div>
                    {c.cnr && <Field label="CNR" value={c.cnr} mono copyable />}
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      {c.registrationDate && <>Filed {c.registrationDate} </>}
                      {c.nextHearingDate && <>· Next hearing {c.nextHearingDate}</>}
                      {c.decisionDate && <>· Decided {c.decisionDate}</>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <RawPayload label="Crime poll response" payload={event.crimeCheckData.pollData} />
            {event.crimeCheckData.initiateData && (
              <RawPayload label="Crime initiate response" payload={event.crimeCheckData.initiateData} />
            )}
          </>
        )}
      </Section>

      {/* Raw event */}
      <Section icon={FileText} title="Raw fg_gate_events record">
        <RawPayload
          label="gate event document"
          payload={{ ...event, time: event.time?.toISOString?.() }}
          defaultOpen
        />
      </Section>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        <Icon className="h-3.5 w-3.5 text-brand-700" />
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  copyable,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  function copy() {
    if (!value) return;
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }
  return (
    <div className="flex items-start gap-2 text-[12.5px]">
      <div className="shrink-0 basis-32 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <div className={cx("min-w-0 flex-1 break-all", mono && "font-mono text-[12px]")}>{value}</div>
      {copyable && value && (
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          title={copied ? "Copied" : "Copy"}
        >
          {copied ? <Check className="h-3 w-3 text-success-600" /> : <ClipboardCopy className="h-3 w-3" />}
        </button>
      )}
    </div>
  );
}

/**
 * Collapsible raw-JSON viewer with a "copy original response" button.
 * The JSON is stringified at render time but `JSON.parse(JSON.stringify(...))`
 * preserves the structure faithfully (the raw data here is already plain JSON
 * coming back from the provider — no class instances or Dates to worry about).
 */
function RawPayload({
  label,
  payload,
  defaultOpen,
}: {
  label: string;
  payload: unknown;
  defaultOpen?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  function copy() {
    const text = JSON.stringify(payload, null, 2);
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60" open={defaultOpen}>
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2">
        <span className="text-[11.5px] font-semibold uppercase tracking-wider text-slate-600">
          {label} (raw)
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            copy();
          }}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
          title="Copy original response JSON"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-success-600" /> Copied
            </>
          ) : (
            <>
              <ClipboardCopy className="h-3 w-3" /> Copy original
            </>
          )}
        </button>
      </summary>
      <pre className="max-h-80 overflow-auto border-t border-slate-200 bg-white p-3 text-[11px] text-slate-700">
        {JSON.stringify(payload, null, 2)}
      </pre>
    </details>
  );
}

function ParseError({ message, provider }: { message: string; provider: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-[12.5px] text-red-700">
      <div className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-3.5 w-3.5" /> Could not parse provider response
      </div>
      <div className="mt-1">{message}</div>
      <div className="mt-1 font-mono text-[10.5px] text-red-600">provider: {provider}</div>
    </div>
  );
}

function ImageThumb({ label, url }: { label: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="group block overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
      title={label}
    >
      <div className="flex items-center gap-1 border-b border-slate-200 px-2 py-1 text-[10.5px] font-semibold text-slate-600">
        <ImageIcon className="h-3 w-3" /> {label}
        <LinkIcon className="ml-auto h-3 w-3 text-slate-400 group-hover:text-brand-700" />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={label} className="h-32 w-full object-cover" />
    </a>
  );
}
