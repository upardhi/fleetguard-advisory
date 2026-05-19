import type { AlertSeverity, StopStatus, TripStatus } from "../_lib/types";
import { Badge } from "./Badge";

export function TripStatusPill({ status }: { status: TripStatus }) {
  const map: Record<
    TripStatus,
    { tone: "neutral" | "brand" | "warning" | "success" | "info"; label: string }
  > = {
    planned: { tone: "neutral", label: "Planned" },
    loading: { tone: "info", label: "Loading" },
    in_transit: { tone: "brand", label: "In Transit" },
    returning: { tone: "warning", label: "Returning" },
    closed: { tone: "success", label: "Closed" },
  };
  const v = map[status];
  return (
    <Badge tone={v.tone} dot>
      {v.label}
    </Badge>
  );
}

export function StopStatusPill({ status }: { status: StopStatus }) {
  const map: Record<
    StopStatus,
    { tone: "success" | "warning" | "danger" | "neutral" | "info"; label: string }
  > = {
    pending: { tone: "neutral", label: "Pending" },
    confirmed: { tone: "success", label: "Confirmed" },
    undelivered: { tone: "warning", label: "Undelivered" },
    returned: { tone: "info", label: "Returned" },
    disputed: { tone: "danger", label: "Disputed" },
    rescheduled: { tone: "warning", label: "Rescheduled" },
  };
  const v = map[status];
  return (
    <Badge tone={v.tone} dot>
      {v.label}
    </Badge>
  );
}

export function SeverityPill({ severity }: { severity: AlertSeverity }) {
  const map: Record<AlertSeverity, { tone: "info" | "warning" | "danger"; label: string }> = {
    info: { tone: "info", label: "Info" },
    warning: { tone: "warning", label: "Warning" },
    critical: { tone: "danger", label: "Critical" },
  };
  const v = map[severity];
  return (
    <Badge tone={v.tone} dot>
      {v.label}
    </Badge>
  );
}
