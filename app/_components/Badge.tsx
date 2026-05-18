import { type DisruptionCategory } from "@/app/_lib/types";
import { categoryLabel } from "@/app/_lib/utils";

const CAT_STYLE: Record<string, string> = {
  political:        "bg-rose-100 text-rose-700 border-rose-200",
  weather:          "bg-sky-100 text-sky-700 border-sky-200",
  traffic:          "bg-orange-100 text-orange-700 border-orange-200",
  security:         "bg-red-100 text-red-700 border-red-200",
  infrastructure:   "bg-slate-100 text-slate-600 border-slate-200",
  religious:        "bg-purple-100 text-purple-700 border-purple-200",
  vvip:             "bg-yellow-100 text-yellow-700 border-yellow-200",
  natural_disaster: "bg-indigo-100 text-indigo-700 border-indigo-200",
};

export default function CategoryBadge({ category }: { category: DisruptionCategory }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${CAT_STYLE[category] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
      {categoryLabel(category)}
    </span>
  );
}
