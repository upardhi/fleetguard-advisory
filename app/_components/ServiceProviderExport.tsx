"use client";

/**
 * ServiceProviderExport
 *
 * Reusable CSV export menu for the Service Providers list view. Used by:
 *   • /manager/contractors (Warehouse Manager + Regional Manager)
 *   • /cso/contractors     (CSO)
 *
 * Two export modes:
 *   • "Export all data"          → every driver-entry record visible to the user
 *   • "Export flagged data only" → only rows carrying a risk flag (expired/
 *     invalid DL, criminal/civil cases, blocked or denied entry, manual
 *     override applied)
 *
 * One CSV row per unique driver per service provider — built from the same
 * `entryEvents` array each page already loads, so the export naturally
 * follows the warehouse-context filter (single warehouse vs. all warehouses)
 * without any extra fetching.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, FileDown, Filter } from "lucide-react";
import { Button } from "./Button";
import type { FgGateEvent } from "../_services/gateEventService";
import type { FgServiceProvider } from "../_services/serviceProviderService";
import type { FgWarehouse } from "../_services/warehouseService";
import { translateCrimeCheckResponse, type CrimeCase } from "../_services/crimeCheckService";
import { translateDlResponse, validateDl } from "../_services/dlVerifyService";

interface Props {
  /**
   * Driver-entry events for the current scope (single warehouse OR all
   * warehouses, depending on the page's warehouse filter). One event per
   * unique driverId thanks to `getDriverEntryEvents{,ByOrg}` deduping.
   */
  entryEvents: FgGateEvent[];
  /** Org's service providers — used to resolve provider/vendor name per row. */
  providers: FgServiceProvider[];
  /**
   * Org's warehouses — used to resolve human-readable warehouse names per row.
   * Optional; if missing the warehouse column falls back to the raw id.
   */
  warehouses?: FgWarehouse[];
  /** Override the CSV filename prefix; defaults to "fleetguard-service-providers". */
  filenamePrefix?: string;
}

interface ExportRow {
  driverName: string;
  vendorName: string;
  dlNumber: string;
  dlStatus: string;
  dlValidity: string;
  dlExpired: "yes" | "no" | "";
  dlInvalid: "yes" | "no" | "";
  hasCriminalCase: "yes" | "no" | "";
  totalCases: number;
  criminalCases: number;
  civilCases: number;
  activeCases: number;
  pendingCases: number;
  blockedStatus: "yes" | "no" | "";
  cnrNumbers: string;
  vehicleReg: string;
  warehouseName: string;
  guardName: string;
  lastEntryAt: string;
  lastEntryStatus: string;
  hasAnyFlag: boolean;
}

const COLUMNS: { key: keyof Omit<ExportRow, "hasAnyFlag">; label: string }[] = [
  { key: "driverName",         label: "Driver name" },
  { key: "vendorName",         label: "Vendor / company" },
  { key: "dlNumber",           label: "DL number" },
  { key: "dlStatus",           label: "DL status" },
  { key: "dlValidity",         label: "DL validity (transport)" },
  { key: "dlExpired",          label: "DL expired" },
  { key: "dlInvalid",          label: "DL invalid" },
  { key: "hasCriminalCase",    label: "Criminal case flag" },
  { key: "totalCases",         label: "Total cases" },
  { key: "criminalCases",      label: "Criminal cases" },
  { key: "civilCases",         label: "Civil cases" },
  { key: "activeCases",        label: "Active cases" },
  { key: "pendingCases",       label: "Pending cases" },
  { key: "blockedStatus",      label: "Blocked / denied" },
  { key: "cnrNumbers",         label: "CNR numbers" },
  { key: "vehicleReg",         label: "Vehicle registration" },
  { key: "warehouseName",      label: "Warehouse" },
  { key: "guardName",          label: "Guard at entry" },
  { key: "lastEntryAt",        label: "Last entry timestamp" },
  { key: "lastEntryStatus",    label: "Last entry status" },
];

const INVALID_TRANSPORT_STATUSES = new Set([
  "invalid_personal_only",
]);

function isCaseActive(c: CrimeCase): boolean {
  return (
    !c.decisionDate?.trim() ||
    c.caseStatus?.toLowerCase().includes("active") ||
    c.caseStatus?.toLowerCase().includes("pending")
  );
}

function isCasePending(c: CrimeCase): boolean {
  return c.caseStatus?.toLowerCase().includes("pending") || !c.decisionDate?.trim();
}

function buildRow(
  ev: FgGateEvent,
  providerById: Map<string, FgServiceProvider>,
  warehouseNameById: Map<string, string>,
): ExportRow {
  const provider = ev.contractorId ? providerById.get(ev.contractorId) : null;

  // ── DL parsing ──────────────────────────────────────────────────────────────
  let dlStatus = "";
  let dlValidity = "";
  let dlInvalid = false;
  let dlExpired = false;
  let dlNumber = ev.dlNumber ?? "";
  if (ev.dlVerifyData?.provider && ev.dlVerifyData.data) {
    try {
      const normalized = translateDlResponse(ev.dlVerifyData.provider, ev.dlVerifyData.data);
      const validation = validateDl(normalized, "");
      dlStatus = validation.label || validation.status;
      dlValidity = normalized.validity?.transport
        ? `${normalized.validity.transport.from || "—"} → ${normalized.validity.transport.to || "—"}`
        : "";
      if (!dlNumber) dlNumber = normalized.dlNumber;
      if (INVALID_TRANSPORT_STATUSES.has(validation.status)) dlInvalid = true;
      if (
        validation.status === "invalid_transport_expired" ||
        validation.status === "invalid_personal_only"
      ) {
        // expired transport endorsement is the most common "expired DL" flag
        dlExpired = validation.status === "invalid_transport_expired";
      }
    } catch {
      // unknown provider — leave fields blank, mark verification as failed only
      // if we genuinely had data we couldn't read.
    }
  }

  // ── Crime parsing ───────────────────────────────────────────────────────────
  let cases: CrimeCase[] = [];
  if (ev.crimeCheckData?.provider && ev.crimeCheckData.pollData) {
    try {
      const result = translateCrimeCheckResponse(ev.crimeCheckData.provider, ev.crimeCheckData.pollData);
      cases = result.cases;
    } catch {
      // swallow — treat as no cases if provider unrecognised
    }
  }
  const criminal = cases.filter((c) => c.caseCategory?.toLowerCase() === "criminal");
  const civil    = cases.filter((c) => c.caseCategory?.toLowerCase() === "civil");
  const totalCases    = cases.length;
  const activeCases   = cases.filter(isCaseActive).length;
  const pendingCases  = cases.filter(isCasePending).length;
  const cnrNumbers    = cases.map((c) => c.cnr).filter(Boolean).join("; ");

  const blocked         = ev.status === "denied";
  const hasCriminal     = criminal.length > 0;

  const hasAnyFlag =
    dlExpired ||
    dlInvalid ||
    hasCriminal ||
    activeCases > 0 ||
    pendingCases > 0 ||
    blocked;
  return {
    driverName:         ev.personName ?? "",
    vendorName:         provider?.name ?? ev.contractorName ?? "",
    dlNumber,
    dlStatus,
    dlValidity,
    dlExpired:          dlStatus ? (dlExpired ? "yes" : "no") : "",
    dlInvalid:          dlStatus ? (dlInvalid ? "yes" : "no") : "",
    hasCriminalCase:    cases.length > 0 || ev.crimeCheckData ? (hasCriminal ? "yes" : "no") : "",
    totalCases,
    criminalCases:      criminal.length,
    civilCases:         civil.length,
    activeCases,
    pendingCases,
    blockedStatus:      ev.status ? (blocked ? "yes" : "no") : "",
    cnrNumbers,
    vehicleReg:         ev.vehicleReg ?? "",
    warehouseName:      ev.warehouseId ? (warehouseNameById.get(ev.warehouseId) ?? ev.warehouseId) : "",
    guardName:          ev.guardName ?? "",
    lastEntryAt:        ev.time?.toISOString?.() ?? "",
    lastEntryStatus:    ev.status ?? "",
    hasAnyFlag,
  };
}

/**
 * Write rows as a real XLSX workbook with an Excel table applied. Using the
 * `TableStyleLight2` (light blue banded) preset gives users auto-filter,
 * bold header, and alternating row colours natively — so the file opens as a
 * proper table in Excel / Google Sheets / Numbers without any extra steps.
 *
 * Dynamic import keeps the exceljs bundle out of the initial page payload —
 * it's only pulled in when the user actually clicks Export.
 */
async function downloadXlsx(rows: ExportRow[], filenameNoExt: string) {
  const { Workbook } = await import("exceljs");
  const wb = new Workbook();
  wb.creator = "FleetGuard";
  wb.created = new Date();

  const ws = wb.addWorksheet("Service Providers", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  // Define columns with sensible widths so Excel opens with usable layout.
  ws.columns = COLUMNS.map((c) => ({
    header: c.label,
    key: c.key,
    width: widthFor(c.key),
  }));

  // Add the table (triggers the named style + auto-filter). Empty tables
  // aren't valid in the OOXML spec, so we seed a single blank row when the
  // dataset is empty — keeps the workbook openable either way.
  const tableRows: unknown[][] =
    rows.length > 0
      ? rows.map((r) => COLUMNS.map((c) => r[c.key]))
      : [COLUMNS.map(() => "")];

  ws.addTable({
    name: "ServiceProviders",
    ref: "A1",
    headerRow: true,
    totalsRow: false,
    style: {
      theme: "TableStyleLight2",   // light-blue banded table
      showRowStripes: true,
    },
    columns: COLUMNS.map((c) => ({ name: c.label, filterButton: true })),
    rows: tableRows as (string | number | boolean | Date | null)[][],
  });

  // Header styling — bold, slightly taller row.
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.height = 22;

  // Number-aligned columns right-align cleanly.
  (["totalCases", "criminalCases", "civilCases", "activeCases", "pendingCases"] as const).forEach(
    (key) => {
      const col = ws.getColumn(key);
      col.alignment = { horizontal: "right" };
    },
  );

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenameNoExt}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Per-column width in Excel "character" units. Numbers are picked to fit
 * typical Indian DL / CNR / vehicle-reg lengths without wrapping.
 */
function widthFor(key: keyof Omit<ExportRow, "hasAnyFlag">): number {
  switch (key) {
    case "driverName":         return 24;
    case "vendorName":         return 28;
    case "dlNumber":           return 18;
    case "dlStatus":           return 22;
    case "dlValidity":         return 24;
    case "dlExpired":
    case "dlInvalid":
    case "hasCriminalCase":
    case "blockedStatus":      return 12;
    case "totalCases":
    case "criminalCases":
    case "civilCases":
    case "activeCases":
    case "pendingCases":       return 10;
    case "cnrNumbers":         return 40;
    case "vehicleReg":         return 16;
    case "warehouseName":      return 22;
    case "guardName":          return 20;
    case "lastEntryAt":        return 22;
    case "lastEntryStatus":    return 14;
    default:                   return 18;
  }
}

export function ServiceProviderExport({
  entryEvents,
  providers,
  warehouses = [],
  filenamePrefix = "fleetguard-service-providers",
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click — matches the WarehouseSwitcher pattern.
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const providerById = new Map(providers.map((p) => [p.id, p]));
  const warehouseNameById = new Map(warehouses.map((w) => [w.id, w.name]));

  const [exporting, setExporting] = useState(false);

  async function doExport(mode: "all" | "flagged") {
    if (exporting) return;
    setExporting(true);
    try {
      const allRows = entryEvents.map((ev) => buildRow(ev, providerById, warehouseNameById));
      const rows = mode === "flagged" ? allRows.filter((r) => r.hasAnyFlag) : allRows;
      // DD-MM-YYYY — canonical dashed form of the requested DD/MM/YYYY since
      // OS download dialogs strip slashes from filenames.
      const now = new Date();
      const date =
        `${String(now.getDate()).padStart(2, "0")}-` +
        `${String(now.getMonth() + 1).padStart(2, "0")}-` +
        `${now.getFullYear()}`;
      const suffix = mode === "flagged" ? "flagged" : "all";
      await downloadXlsx(rows, `${filenamePrefix}-${suffix}-${date}`);
    } finally {
      setExporting(false);
      setOpen(false);
    }
  }

  const allCount = entryEvents.length;
  // Count flagged eagerly so the menu shows a useful hint. Cheap given the
  // data is already in memory and the page only renders this on demand.
  const flaggedCount = entryEvents.reduce(
    (n, ev) => n + (buildRow(ev, providerById, warehouseNameById).hasAnyFlag ? 1 : 0),
    0,
  );

  return (
    <div ref={ref} className="relative inline-block">
      <Button
        size="sm"
        variant="secondary"
        leftIcon={<FileDown className="h-3.5 w-3.5" />}
        rightIcon={<ChevronDown className={open ? "h-3.5 w-3.5 rotate-180" : "h-3.5 w-3.5"} />}
        onClick={() => setOpen((v) => !v)}
        disabled={allCount === 0 || exporting}
      >
        {exporting ? "Exporting…" : "Export"}
      </Button>

      {open && (
        <div className="absolute right-0 z-50 mt-1.5 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <button
            type="button"
            onClick={() => doExport("all")}
            className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition hover:bg-slate-50"
          >
            <FileDown className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-slate-900">Export all data</div>
              <div className="text-[11px] text-slate-500">{allCount} driver record{allCount === 1 ? "" : "s"}</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => doExport("flagged")}
            className="flex w-full items-start gap-2.5 border-t border-slate-100 px-3 py-2.5 text-left transition hover:bg-slate-50"
            disabled={flaggedCount === 0}
          >
            <Filter className="mt-0.5 h-4 w-4 shrink-0 text-danger-600" />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-slate-900">Export flagged data only</div>
              <div className="text-[11px] text-slate-500">
                {flaggedCount === 0
                  ? "No flagged drivers in current view"
                  : `${flaggedCount} flagged driver${flaggedCount === 1 ? "" : "s"} (DL/criminal/blocked)`}
              </div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
