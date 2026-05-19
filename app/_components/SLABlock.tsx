/**
 * Single-block SLA status for an incident row.
 *
 *   ● Breached            ← status badge (Breached / At risk / On track)
 *   1d over               ← relative time
 *   05 May, 14:30         ← absolute deadline
 *   ↑ L3 · CSO            ← escalation chip (only when level > 0)
 *
 * Replaces the previous two-cell layout that stacked SLACell + EscalationBadge
 * with awkward gaps. One component, one block.
 */

import { useMemo } from "react";
import { Badge } from "./Badge";
import { EscalationBadge } from "./EscalationBadge";
import { fmtDateTime } from "../_lib/utils";

interface Props {
  deadline: Date;
  escalationLevel?: number;
}

function formatDelta(diffMin: number): string {
  const abs = Math.abs(diffMin);
  if (abs < 60)   return `${abs}m`;
  if (abs < 1440) return `${Math.floor(abs / 60)}h`;
  return `${Math.floor(abs / 1440)}d`;
}

export function SLABlock({ deadline, escalationLevel = 0 }: Props) {
  const diffMin = useMemo(
    // eslint-disable-next-line react-hooks/purity
    () => Math.floor((deadline.getTime() - Date.now()) / 60_000),
    [deadline],
  );
  const breached = diffMin < 0;
  const atRisk   = !breached && diffMin < 120;

  const tone: "danger" | "warning" | "muted" = breached ? "danger" : atRisk ? "warning" : "muted";
  const label   = breached ? "Breached" : atRisk ? "At risk" : "On track";
  const timeStr = breached ? `${formatDelta(diffMin)} over` : `${formatDelta(diffMin)} left`;
  const timeCls = breached ? "text-danger-700" : atRisk ? "text-warning-700" : "text-slate-600";

  return (
    // items-start prevents the Badge from stretching to the column width
    // (default flex-col children stretch via align-items: stretch).
    <div className="flex flex-col items-start gap-0.5">
      <Badge tone={tone} dot>{label}</Badge>
      <div className={`text-[11px] font-semibold ${timeCls}`}>{timeStr}</div>
      <div className="text-[10.5px] text-slate-400">{fmtDateTime(deadline)}</div>
      {escalationLevel > 0 && (
        <div className="mt-0.5"><EscalationBadge level={escalationLevel} /></div>
      )}
    </div>
  );
}
