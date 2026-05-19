import { CheckCircle2, AlertTriangle, XCircle, Clock4 } from "lucide-react";
import { Badge } from "./Badge";
import type { BGStatus, CheckStatus, FaceMatchResult } from "../_lib/types";

const labels: Record<string, string> = {
  clear: "Clear",
  expiring: "Expiring",
  expired: "Expired",
  blocked: "Blocked",
  pending: "Pending",
  flagged: "Flagged",
  match: "Match",
  uncertain: "Uncertain",
  mismatch: "Mismatch",
};

export function CheckBadge({
  label,
  status,
}: {
  label: string;
  status: CheckStatus | BGStatus | FaceMatchResult;
}) {
  let tone: "success" | "warning" | "danger" | "info" = "success";
  let Icon = CheckCircle2;

  if (status === "clear" || status === "match") {
    tone = "success";
    Icon = CheckCircle2;
  } else if (
    status === "expiring" ||
    status === "uncertain" ||
    status === "pending"
  ) {
    tone = "warning";
    Icon = status === "pending" ? Clock4 : AlertTriangle;
  } else {
    tone = "danger";
    Icon = XCircle;
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
          {label}
        </div>
        <div className="mt-0.5 text-[13px] font-semibold text-slate-900">
          {labels[status] ?? status}
        </div>
      </div>
      <Badge tone={tone} icon={<Icon className="h-3 w-3" />}>
        {tone === "success" ? "OK" : tone === "warning" ? "Watch" : "Block"}
      </Badge>
    </div>
  );
}
