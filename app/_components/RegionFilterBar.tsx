"use client";

/**
 * RegionFilterBar
 *
 * Drop this into any advisory page's filter row to add a
 * "filter by ITC ops region" selector.
 *
 * Usage:
 *   const [region, setRegion] = useState<RegionId>("all");
 *   <RegionFilterBar value={region} onChange={setRegion} counts={countMap} />
 *
 * `counts` is optional — pass a Record<string, number> where keys are region ids
 * and the "all" key holds the total.  When omitted, no count badges are shown.
 */

export type RegionId = "all" | "north" | "east" | "west" | "south";

export const REGION_PILLS: {
  id: RegionId;
  label: string;
  activeClass: string;
  dotClass: string;
}[] = [
  { id: "all",   label: "All Regions", activeClass: "bg-slate-800 text-white border-slate-800",         dotClass: "bg-slate-500"   },
  { id: "north", label: "North",       activeClass: "bg-blue-600 text-white border-blue-600",           dotClass: "bg-blue-500"    },
  { id: "east",  label: "East",        activeClass: "bg-orange-500 text-white border-orange-500",       dotClass: "bg-orange-400"  },
  { id: "west",  label: "West",        activeClass: "bg-purple-600 text-white border-purple-600",       dotClass: "bg-purple-500"  },
  { id: "south", label: "South",       activeClass: "bg-emerald-600 text-white border-emerald-600",     dotClass: "bg-emerald-500" },
];

interface Props {
  value: RegionId;
  onChange: (r: RegionId) => void;
  /** Optional count per region id (use "all" for total) */
  counts?: Partial<Record<RegionId, number>>;
  className?: string;
}

export default function RegionFilterBar({ value, onChange, counts, className = "" }: Props) {
  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className}`}>
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1 shrink-0">Region</span>
      {REGION_PILLS.map((r) => {
        const active = value === r.id;
        const count  = counts?.[r.id];
        return (
          <button
            key={r.id}
            onClick={() => onChange(r.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all shrink-0 ${
              active
                ? r.activeClass
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            {r.id !== "all" && (
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${active ? "bg-white/70" : r.dotClass}`} />
            )}
            {r.label}
            {count !== undefined && (
              <span className={`text-[9px] font-bold px-1 rounded-full min-w-[16px] text-center ${
                active ? "bg-white/20" : "bg-slate-100 text-slate-500"
              }`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
