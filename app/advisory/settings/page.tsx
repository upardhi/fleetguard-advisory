"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Bell, Shield, Globe, Users, LogOut, User,
  KeyRound, Moon, ExternalLink, ArrowLeft,
  RefreshCw, Trash2, CheckCircle2, AlertTriangle, Loader2,
} from "lucide-react";
import { TopBar } from "@/app/_components/TopBar";
import { useAdvisory } from "@/app/_contexts/AdvisoryContext";

const ROLE_LABELS: Record<string, string> = {
  guard:            "Guard",
  wh_manager:       "Warehouse Manager",
  regional_manager: "Regional Manager",
  cso:              "Chief Security Officer",
  company_admin:    "Company Admin",
  super_admin:      "Super Admin",
};

export default function SettingsPage() {
  const { user } = useAdvisory();

  const [notifyAlerts,    setNotifyAlerts]    = useState(true);
  const [notifyIncidents, setNotifyIncidents] = useState(true);
  const [notifyReports,   setNotifyReports]   = useState(false);

  const [autoHold,    setAutoHold]    = useState(true);
  const [autoReroute, setAutoReroute] = useState(true);
  const [nightAdv,    setNightAdv]    = useState(true);

  const [northIndia, setNorthIndia] = useState(true);
  const [westIndia,  setWestIndia]  = useState(true);
  const [southIndia, setSouthIndia] = useState(true);
  const [eastIndia,  setEastIndia]  = useState(true);

  const [loggingOut, setLoggingOut] = useState(false);

  // ── Intelligence reset ───────────────────────────────────────────────────
  type ResetState = "idle" | "confirming" | "running" | "done" | "error";
  const [resetState, setResetState]     = useState<ResetState>("idle");
  const [resetMessage, setResetMessage] = useState("");

  // ── Manual intelligence processor ────────────────────────────────────────
  type ProcessState = "idle" | "running" | "done" | "error";
  const [processState,   setProcessState]   = useState<ProcessState>("idle");
  const [processMessage, setProcessMessage] = useState("");
  const [processProgress, setProcessProgress] = useState<{ done: number; total: number } | null>(null);

  async function handleReset() {
    if (resetState === "idle") { setResetState("confirming"); return; }
    if (resetState === "confirming") {
      setResetState("running");
      setResetMessage("");
      try {
        const res  = await fetch("/api/advisory/v1/admin/reset-intelligence", {
          method: "POST", credentials: "include",
        });
        const data = await res.json() as { ok?: boolean; message?: string; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error ?? "Reset failed");
        setResetMessage(data.message ?? "Done.");
        setResetState("done");
        // Auto-reset the button after 8 seconds
        setTimeout(() => { setResetState("idle"); setResetMessage(""); }, 8000);
      } catch (err) {
        setResetMessage(err instanceof Error ? err.message : "Unknown error");
        setResetState("error");
        setTimeout(() => { setResetState("idle"); setResetMessage(""); }, 6000);
      }
    }
  }

  async function handleProcessJobs() {
    setProcessState("running");
    setProcessMessage("Starting intelligence processing…");
    setProcessProgress(null);

    let batches = 0;
    const MAX_BATCHES = 200; // safety cap — 200 batches × 8 segments = 1,600 segments max

    try {
      while (batches < MAX_BATCHES) {
        const res  = await fetch("/api/cron/run-intelligence", { method: "POST", credentials: "include" });
        const data = await res.json() as {
          ok?: boolean;
          message?: string;
          complete?: boolean;
          segmentsDone?: number;
          segmentsTotal?: number;
        };

        if (!res.ok) throw new Error(data.message ?? "Processor error");

        if (data.message === "No pending jobs") {
          // All done
          setProcessMessage(`Done — ${batches} batch${batches !== 1 ? "es" : ""} processed.`);
          setProcessState("done");
          setProcessProgress(null);
          setTimeout(() => { setProcessState("idle"); setProcessMessage(""); setProcessProgress(null); }, 10_000);
          return;
        }

        batches++;
        if (data.segmentsDone !== undefined && data.segmentsTotal !== undefined) {
          setProcessProgress({ done: data.segmentsDone, total: data.segmentsTotal });
          setProcessMessage(`Batch ${batches} — segment ${data.segmentsDone}/${data.segmentsTotal}…`);
        } else {
          setProcessMessage(`Processing batch ${batches}…`);
        }

        // Small yield so the UI can re-render
        await new Promise<void>((r) => setTimeout(r, 300));
      }
      setProcessMessage("Reached batch limit. Some jobs may still be pending — run again.");
      setProcessState("done");
      setTimeout(() => { setProcessState("idle"); setProcessMessage(""); setProcessProgress(null); }, 10_000);
    } catch (err) {
      setProcessMessage(err instanceof Error ? err.message : "Unknown error");
      setProcessState("error");
      setTimeout(() => { setProcessState("idle"); setProcessMessage(""); setProcessProgress(null); }, 8_000);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/auth/v2/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const isAdmin = user?.role === "company_admin" || user?.role === "super_admin";

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar title="Settings" subtitle="Platform configuration and notification preferences" />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">

          <Link
            href="/advisory"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition"
          >
            <ArrowLeft size={14} />
            Back to Control Tower
          </Link>

          {/* Account */}
          {user && (
            <Section icon={User} title="Account" desc="Your identity and access details">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <KV label="Full Name">{user.name}</KV>
                <KV label="Email">{user.email}</KV>
                <KV label="Role">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700">
                    {ROLE_LABELS[user.role] ?? user.role}
                  </span>
                </KV>
                <KV label="Organisation">{user.orgName ?? "—"}</KV>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-3 py-2.5 text-xs text-slate-500 mb-3">
                <KeyRound size={13} className="text-slate-400" />
                Need to update your name or email? Contact your administrator.
              </div>
              <div className="flex items-center gap-4">
                <Link
                  href="/advisory/profile"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-900"
                >
                  <User size={13} />
                  View profile
                </Link>
                {isAdmin && (
                  <>
                    <span className="text-slate-200">|</span>
                    <Link
                      href="/advisory/team"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-900"
                    >
                      <Users size={13} />
                      View team
                    </Link>
                  </>
                )}
              </div>
            </Section>
          )}

          {/* Notifications */}
          <Section icon={Bell} title="Notification Preferences" desc="Configure how and when you receive disruption alerts">
            <Toggle
              label="Critical disruption alerts"
              description="Riots, floods, VVIP movements, and urgent events"
              checked={notifyAlerts}
              onToggle={() => setNotifyAlerts((v) => !v)}
            />
            <Toggle
              label="Daily risk summary (08:00 IST)"
              description="Morning briefing for your monitored routes and corridors"
              checked={notifyIncidents}
              onToggle={() => setNotifyIncidents((v) => !v)}
            />
            <Toggle
              label="Safe corridor notifications"
              description="Alert when a blocked route becomes safe again"
              checked={notifyReports}
              onToggle={() => setNotifyReports((v) => !v)}
            />
          </Section>

          {/* Risk thresholds */}
          <Section icon={Shield} title="Risk Thresholds" desc="Customize risk score thresholds for advisory triggers">
            <Toggle
              label="Auto-hold threshold: Score ≥ 75"
              description="Automatically recommend hold for high-risk routes"
              checked={autoHold}
              onToggle={() => setAutoHold((v) => !v)}
            />
            <Toggle
              label="Auto-reroute threshold: Score ≥ 55"
              description="Suggest alternative routes when risk exceeds threshold"
              checked={autoReroute}
              onToggle={() => setAutoReroute((v) => !v)}
            />
            <Toggle
              label="Night travel advisory"
              description="Flag high-risk routes between 21:00–05:00 IST"
              checked={nightAdv}
              onToggle={() => setNightAdv((v) => !v)}
            />
          </Section>

          {/* Monitored regions */}
          <Section icon={Globe} title="Monitored Regions" desc="Select which regions to actively monitor for disruptions">
            <Toggle
              label="North India (Delhi, Haryana, Punjab, UP)"
              description="NH44, NH24, NH1 corridor monitoring"
              checked={northIndia}
              onToggle={() => setNorthIndia((v) => !v)}
            />
            <Toggle
              label="West India (Maharashtra, Gujarat, Rajasthan)"
              description="NH48, NH52, NH27 corridor monitoring"
              checked={westIndia}
              onToggle={() => setWestIndia((v) => !v)}
            />
            <Toggle
              label="South India (Karnataka, TN, AP, Telangana)"
              description="NH275, NH44 South, NH16 corridor monitoring"
              checked={southIndia}
              onToggle={() => setSouthIndia((v) => !v)}
            />
            <Toggle
              label="East India (WB, Odisha, Bihar, Jharkhand)"
              description="NH16, NH37, NH30 corridor monitoring"
              checked={eastIndia}
              onToggle={() => setEastIndia((v) => !v)}
            />
          </Section>

          {/* Appearance */}
          <Section icon={Moon} title="Appearance" desc="Display preferences for your device">
            <div className="flex items-center justify-between py-1">
              <div>
                <div className="text-sm font-medium text-slate-800">Theme</div>
                <div className="text-xs text-slate-500">System default — dark mode coming soon</div>
              </div>
              <span className="text-xs text-slate-400 px-2 py-1 rounded-full border border-slate-200 bg-slate-50">
                Coming soon
              </span>
            </div>
          </Section>

          {/* Team & Org */}
          <Section icon={Users} title="Team & Organisation" desc="Shared with your FleetGuard organisation account">
            <p className="text-sm text-slate-600 mb-3">
              User management, team invitations, warehouse setup, and billing are managed through your main
              <span className="font-semibold text-brand-700"> FleetGuard</span> account.
              All advisory users are synced from your organisation profile.
            </p>
            <div className="flex items-center gap-4">
              <a
                href="#"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-900"
              >
                <ExternalLink size={13} />
                Open FleetGuard
              </a>
              {isAdmin && (
                <>
                  <span className="text-slate-200">|</span>
                  <Link
                    href="/advisory/team"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-900"
                  >
                    <Users size={13} />
                    View team
                  </Link>
                </>
              )}
            </div>
          </Section>

          {/* Intelligence Reset — admin only */}
          {isAdmin && (
            <Section icon={RefreshCw} title="Intelligence Data" desc="Manage the AI news-analysis cache for all your corridors">
              <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800 mb-3 flex items-start gap-2">
                <AlertTriangle size={15} className="shrink-0 mt-0.5 text-orange-500" />
                <div>
                  <p className="font-semibold">Full Intelligence Reset</p>
                  <p className="text-xs mt-0.5 text-orange-700">
                    Clears all cached disruption flags, corridor events, and in-app notifications, then immediately re-queues every corridor for a fresh AI scan.
                    The <code className="bg-orange-100 px-1 rounded">run-intelligence</code> cron will process corridors within the next minute.
                  </p>
                </div>
              </div>

              {resetState === "done" && (
                <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-3">
                  <CheckCircle2 size={15} className="shrink-0 text-emerald-500" />
                  {resetMessage}
                </div>
              )}
              {resetState === "error" && (
                <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-3">
                  <AlertTriangle size={15} className="shrink-0 text-red-500" />
                  {resetMessage}
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                <div>
                  {resetState === "confirming" ? (
                    <p className="text-sm font-semibold text-orange-700">
                      Are you sure? This will delete all current disruption data.
                    </p>
                  ) : (
                    <div>
                      <div className="text-sm font-medium text-slate-800">Clear &amp; Re-analyse</div>
                      <div className="text-xs text-slate-500">Removes stale news, duplicates, and old flags. Fresh scan starts within 60s.</div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {resetState === "confirming" && (
                    <button
                      onClick={() => setResetState("idle")}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    onClick={() => void handleReset()}
                    disabled={resetState === "running" || resetState === "done"}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-60 ${
                      resetState === "confirming"
                        ? "bg-red-600 text-white hover:bg-red-700"
                        : resetState === "running"
                          ? "bg-orange-100 text-orange-700"
                          : "bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200"
                    }`}
                  >
                    {resetState === "running" ? (
                      <><Loader2 size={14} className="animate-spin" /> Resetting…</>
                    ) : resetState === "confirming" ? (
                      <><Trash2 size={14} /> Yes, Reset All</>
                    ) : (
                      <><RefreshCw size={14} /> Reset Intelligence</>
                    )}
                  </button>
                </div>
              </div>
            </Section>
          )}

          {/* Manual Intelligence Processor — admin only */}
          {isAdmin && (
            <Section icon={RefreshCw} title="Process Intelligence Jobs" desc="Manually run queued intelligence scans (use after reset or in local dev)">
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 mb-3 flex items-start gap-2">
                <AlertTriangle size={15} className="shrink-0 mt-0.5 text-blue-500" />
                <div>
                  <p className="font-semibold">Local / Manual Mode</p>
                  <p className="text-xs mt-0.5 text-blue-700">
                    In production, intelligence jobs run automatically every minute via Vercel Cron.
                    In local development, use this button to process all queued jobs now.
                    Each batch processes 8 segments — this may take several minutes for large corridor sets.
                  </p>
                </div>
              </div>

              {processState === "done" && (
                <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-3">
                  <CheckCircle2 size={15} className="shrink-0 text-emerald-500" />
                  {processMessage}
                </div>
              )}
              {processState === "error" && (
                <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-3">
                  <AlertTriangle size={15} className="shrink-0 text-red-500" />
                  {processMessage}
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-slate-800">Run Pending Jobs</div>
                  {processState === "running" ? (
                    <div className="text-xs text-slate-500 mt-0.5">{processMessage}</div>
                  ) : (
                    <div className="text-xs text-slate-500">Processes all <code className="bg-slate-100 px-1 rounded">pending</code> intelligence jobs in the queue.</div>
                  )}
                  {processProgress && (
                    <div className="mt-2 w-48">
                      <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-brand-500 transition-all duration-300"
                          style={{ width: `${Math.round((processProgress.done / processProgress.total) * 100)}%` }}
                        />
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{processProgress.done}/{processProgress.total} segments</div>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => void handleProcessJobs()}
                  disabled={processState === "running" || processState === "done"}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-60 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 shrink-0"
                >
                  {processState === "running" ? (
                    <><Loader2 size={14} className="animate-spin" /> Processing…</>
                  ) : (
                    <><RefreshCw size={14} /> Process Jobs Now</>
                  )}
                </button>
              </div>
            </Section>
          )}

          {/* Session */}
          <Section icon={LogOut} title="Session" desc="Sign out of your advisory account on this device">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-slate-800">Log out</div>
                <div className="text-xs text-slate-500">You&apos;ll be returned to the sign-in screen.</div>
              </div>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 text-red-700 text-sm font-medium hover:bg-red-100 transition disabled:opacity-60"
              >
                <LogOut size={14} />
                {loggingOut ? "Signing out…" : "Log out"}
              </button>
            </div>
          </Section>

        </div>
      </div>
    </div>
  );
}

function Section({
  icon: Icon, title, desc, children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
        <Icon size={16} className="text-brand-600" />
        <div>
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          <p className="text-xs text-slate-500">{desc}</p>
        </div>
      </div>
      <div className="p-5 space-y-3">{children}</div>
    </div>
  );
}

function Toggle({
  label, description, checked, onToggle,
}: {
  label: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-800">{label}</div>
        <div className="text-xs text-slate-500">{description}</div>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
          checked ? "bg-brand-600" : "bg-slate-200"
        }`}
        role="switch"
        aria-checked={checked}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
            checked ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2.5">
      <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-sm text-slate-800">{children}</div>
    </div>
  );
}
