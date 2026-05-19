/**
 * Static chip showing which escalation stage an incident is at.
 *   0 → no badge (initial)
 *   1 → "Reminded" (warning)
 *   2 → "Escalated to RM" (danger)
 *   3 → "Escalated to CSO" (critical)
 */
export function EscalationBadge({ level }: { level: number }) {
  if (level <= 0) return null;

  const config =
    level === 1
      ? { label: "Reminded",         cls: "bg-warning-50 text-warning-700 ring-warning-200" }
      : level === 2
      ? { label: "Escalated to RM",  cls: "bg-danger-50  text-danger-700  ring-danger-200"  }
      : { label: "Escalated to CSO", cls: "bg-danger-100 text-danger-800  ring-danger-300"  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${config.cls}`}>
      ↑ L{level} · {config.label}
    </span>
  );
}
