import clsx, { type ClassValue } from "clsx";
import type { DisruptionCategory } from "./types";

/** Tailwind-friendly classnames merger. */
export function cx(...inputs: ClassValue[]) {
  return clsx(inputs);
}

function toDate(d: Date | string | null | undefined): Date | null {
  if (!d) return null;
  if (d instanceof Date) return d;
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/** Format a date as an Indian-locale short display. */
export function fmtDate(d: Date | string | null | undefined, fallback = "—"): string {
  const date = toDate(d);
  if (!date) return fallback;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Format a date as hh:mm AM/PM (12-hour). */
export function fmtTime(d: Date | string | null | undefined, fallback = "—"): string {
  const date = toDate(d);
  if (!date) return fallback;
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function fmtDateTime(d: Date | string | null | undefined, fallback = "—"): string {
  if (!d) return fallback;
  return `${fmtDate(d)} · ${fmtTime(d)}`;
}

/** Minutes elapsed since a moment, as a compact label. */
export function fmtAgo(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return "—";
  const diff = Math.max(0, Date.now() - date.getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;

}

/** Days between now and a date (negative = past). */
export function daysUntil(d: Date): number {
  return Math.floor((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** Deterministic colour for a string (used for avatars). */
export function avatarHue(seed: string | null | undefined): number {
  const safeSeed = (seed ?? "").toString();
  let hash = 0;
  for (let i = 0; i < safeSeed.length; i++) {
    hash = (hash << 5) - hash + safeSeed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}

// ── Advisory helpers ──────────────────────────────────────────────

const CATEGORY_ICONS: Record<DisruptionCategory, string> = {
  political:        "🏛️",
  weather:          "🌧️",
  traffic:          "🚦",
  security:         "🛡️",
  infrastructure:   "🚧",
  religious:        "🕌",
  vvip:             "👑",
  natural_disaster: "🌊",
};

const CATEGORY_LABELS: Record<DisruptionCategory, string> = {
  political:        "Political",
  weather:          "Weather",
  traffic:          "Traffic",
  security:         "Security",
  infrastructure:   "Infrastructure",
  religious:        "Religious Event",
  vvip:             "VVIP Movement",
  natural_disaster: "Natural Disaster",
};

export function categoryIcon(cat: DisruptionCategory): string {
  return CATEGORY_ICONS[cat] ?? "⚠️";
}

export function categoryLabel(cat: DisruptionCategory): string {
  return CATEGORY_LABELS[cat] ?? cat;
}

/** Human-readable "X minutes/hours/days ago" string. */
export function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/** Format a date as short Indian-locale display (day Mon YYYY, hh:mm IST). */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }) + " IST";
}
