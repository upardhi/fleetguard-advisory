import type { BGStatus } from "../_lib/types";

/**
 * Empty-state panel shown in the driver detail view when there are no crime
 * cases to render. Copy and palette adapt to the driver's bg_status:
 *   clear   → green "no cases" (also when a gate event exists with empty cases)
 *   flagged → red, but the matches list is rendered above so this is rare
 *   failed  → red "check failed, retry"
 *   pending → amber "not yet completed"
 */
export function BgEmptyState({
  bgStatus,
  hasGateEvent,
}: {
  bgStatus: BGStatus;
  hasGateEvent: boolean;
}) {
 const view =
  bgStatus === "clear" || (hasGateEvent && bgStatus !== "failed" && bgStatus !== "pending")
    ? {
        palette: "success" as const,
        title: "No records found",
        detail: "No criminal records were found for this driver. The driver is clear to proceed.",
      }
    : bgStatus === "failed"
    ? {
        palette: "danger" as const,
        title: "Verification could not be completed",
        detail: "We were unable to complete the background verification at this time. Please try again or contact support at contact@fraudcheck.ai.",
      }
    : bgStatus === "flagged"
    ? {
        palette: "danger" as const,
        title: "Records found",
        detail: "This driver has associated records. Please review the details above before allowing entry.",
      }
    : {
        palette: "warning" as const,
        title: "Verification in progress",
        detail: "The background check is currently in progress. Please wait a moment and refresh for updated results.",
      };

  const wrap =
    view.palette === "success" ? "border-success-100 bg-success-50/60 text-success-800"
    : view.palette === "danger" ? "border-danger-100 bg-danger-50/60 text-danger-800"
    : "border-warning-100 bg-warning-50/60 text-warning-800";

  const detailCls =
    view.palette === "success" ? "text-success-700"
    : view.palette === "danger" ? "text-danger-700"
    : "text-warning-700";

  return (
    <div className={`rounded-xl border px-4 py-5 text-center ${wrap}`}>
      <div className="text-[13px] font-semibold">{view.title}</div>
      <div className={`mt-1 text-[12px] ${detailCls}`}>{view.detail}</div>
    </div>
  );
}
