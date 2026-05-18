import type { RiskLevel, DisruptionCategory } from "./types";

export function riskColor(level: RiskLevel): string {
  switch (level) {
    case "critical": return "#dc2626";
    case "high":     return "#ea580c";
    case "medium":   return "#d97706";
    case "low":      return "#16a34a";
    case "safe":     return "#15803d";
    default:         return "#64748b";
  }
}

export function riskBg(level: RiskLevel): string {
  switch (level) {
    case "critical": return "bg-red-100 text-red-700";
    case "high":     return "bg-orange-100 text-orange-700";
    case "medium":   return "bg-amber-100 text-amber-700";
    case "low":      return "bg-green-100 text-green-700";
    case "safe":     return "bg-emerald-100 text-emerald-700";
    default:         return "bg-slate-100 text-slate-600";
  }
}

export function riskDot(level: RiskLevel): string {
  switch (level) {
    case "critical": return "bg-red-500";
    case "high":     return "bg-orange-500";
    case "medium":   return "bg-amber-500";
    case "low":      return "bg-green-500";
    case "safe":     return "bg-emerald-500";
    default:         return "bg-slate-400";
  }
}

export function categoryIcon(cat: DisruptionCategory): string {
  switch (cat) {
    case "political":        return "🏛️";
    case "weather":          return "🌧️";
    case "traffic":          return "🚧";
    case "security":         return "⚠️";
    case "infrastructure":   return "🔧";
    case "religious":        return "🔔";
    case "vvip":             return "🚨";
    case "natural_disaster": return "🌊";
    default:                 return "📍";
  }
}

export function categoryLabel(cat: DisruptionCategory): string {
  switch (cat) {
    case "political":        return "Political Unrest";
    case "weather":          return "Weather Alert";
    case "traffic":          return "Traffic Disruption";
    case "security":         return "Security Alert";
    case "infrastructure":   return "Infrastructure";
    case "religious":        return "Religious Event";
    case "vvip":             return "VVIP Movement";
    case "natural_disaster": return "Natural Disaster";
    default:                 return cat;
  }
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
