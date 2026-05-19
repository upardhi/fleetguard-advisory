/**
 * Vertical activity timeline for an incident.
 *
 * Reads from `incident_events` (one row per state change). Renders newest-last
 * so the user reads top-to-bottom in chronological order.
 */

import { CheckCircle2, ArrowUpRight, AlertCircle, Pencil, FilePlus, RefreshCw } from "lucide-react";

export interface TimelineEvent {
  id:         string;
  event_type: string;     // 'created' | 'investigating' | 'resolved' | 'closed' | 'escalated' | 'updated'
  actor_id:   string | null;
  actor_name: string | null;
  payload:    Record<string, unknown>;
  created_at: string;
}

const ICON: Record<string, { icon: typeof CheckCircle2; tone: string }> = {
  created:       { icon: FilePlus,      tone: "text-brand-700"   },
  investigating: { icon: RefreshCw,     tone: "text-warning-700" },
  resolved:      { icon: CheckCircle2,  tone: "text-success-700" },
  closed:        { icon: CheckCircle2,  tone: "text-slate-500"   },
  escalated:     { icon: ArrowUpRight,  tone: "text-danger-700"  },
  updated:       { icon: Pencil,        tone: "text-slate-600"   },
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { hour12: true, timeZone: "Asia/Kolkata" });
}

function describe(ev: TimelineEvent): string {
  switch (ev.event_type) {
    case "created":       return "Incident raised";
    case "investigating": return "Investigation started";
    case "resolved":      return "Marked resolved";
    case "closed":        return "Closed";
    case "escalated": {
      const lvl = (ev.payload?.level as number | undefined) ?? 0;
      return lvl === 1 ? "Reminder sent — halfway to the deadline"
        : lvl === 2 ? "Escalated to Regional Manager — deadline reached"
        : lvl === 3 ? "Escalated to CSO team — well past the deadline"
        : "Escalated";
    }
    default:              return "Updated";
  }
}

/** Older rows have actor_name like "System (auto)" or "System (cron)" stored
 *  in the DB. Rewrite those at display time so the user sees a friendly name. */
function friendlyActor(name: string | null): string {
  if (!name) return "FleetGuard";
  const trimmed = name.trim();
  if (trimmed === "" || trimmed === "—") return "FleetGuard";
  if (/^system\s*\((auto|cron)\)$/i.test(trimmed)) return "FleetGuard (automated)";
  return trimmed;
}

function detail(ev: TimelineEvent): string | null {
  const p = ev.payload ?? {};
  if (ev.event_type === "resolved" || ev.event_type === "closed") {
    const note = p.resolution_note as string | undefined;
    return note ? `"${note}"` : null;
  }
  if (ev.event_type === "escalated") {
    const recipients = (p.recipientIds as string[] | undefined)?.length ?? 0;
    return recipients > 0 ? `Notified ${recipients} ${recipients === 1 ? "person" : "people"}` : null;
  }
  return null;
}

export function IncidentTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return <p className="text-[12px] text-slate-500">No timeline events yet.</p>;
  }

  // Sort ascending by created_at
  const sorted = [...events].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  return (
    <ol className="relative ml-2 border-l border-slate-200">
      {sorted.map((ev) => {
        const cfg = ICON[ev.event_type] ?? ICON.updated;
        const Icon = cfg.icon;
        const det = detail(ev);
        return (
          <li key={ev.id} className="ml-4 mb-4 last:mb-0">
            <span className={`absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full bg-white ring-2 ring-slate-200 ${cfg.tone}`}>
              <Icon className="h-2.5 w-2.5" />
            </span>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-baseline gap-2 text-[13px]">
                <span className="font-semibold text-slate-800">{describe(ev)}</span>
                <span className="text-[11px] text-slate-500">by {friendlyActor(ev.actor_name)}</span>
              </div>
              {det && <div className="text-[12px] text-slate-600">{det}</div>}
              <div className="text-[10.5px] uppercase tracking-wider text-slate-400">
                {fmtTime(ev.created_at)}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
