"use client";

import { useEffect, useState } from "react";
import { X, Flag } from "lucide-react";
import { cx } from "../_lib/utils";
import { Button } from "./Button";
import type { FgDriver } from "../_services/driverService";
import type { FgUser } from "../_services/userService";
import { REASON_LABELS, type SupportTicketReason } from "../_services/supportTicketService";

const REASON_ORDER: SupportTicketReason[] = [
  "dl_mismatch",
  "bg_concern",
  "other",
];

interface Props {
  open: boolean;
  driver: FgDriver | null;
  fgUser: FgUser | null;
  onClose: () => void;
  onCreated: () => void;
}

export function ReportDriverModal({ open, driver, fgUser, onClose, onCreated }: Props) {
  const [reason, setReason] = useState<SupportTicketReason>("dl_mismatch");
  const [description, setDescription] = useState("");
  const [notifyEmail, setNotifyEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason("dl_mismatch");
      setDescription("");
      setNotifyEmail(fgUser?.email ?? "");
      setError(null);
    }
  }, [open, fgUser?.email]);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    if (open) document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open, onClose, submitting]);

  if (!open || !driver || !fgUser) return null;

  const canSubmit =
    description.trim().length >= 10 && notifyEmail.trim().length > 0 && !submitting;

  async function submit() {
    if (!driver || !fgUser) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/support-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverId: driver.id,
          reason,
          description: description.trim(),
          notifyEmail: notifyEmail.trim(),
          createdBy: fgUser.uid,
          createdByName: fgUser.displayName,
          createdByRole: fgUser.role,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      onCreated();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to raise ticket");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={() => !submitting && onClose()}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
          <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
            <div>
              <h2 className="flex items-center gap-2 text-[16px] font-semibold text-slate-900">
                <Flag className="h-4 w-4 text-accent-600" />
                Send for cross-verification
              </h2>
              <p className="mt-0.5 text-[12.5px] text-slate-500">
                {driver.fullName} · {driver.dlNumber}
              </p>
            </div>
            <button
              type="button"
              onClick={() => !submitting && onClose()}
              className="ml-4 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-5 p-6">
            <div className="rounded-lg border border-warning-200 bg-warning-50 px-3 py-2.5 text-[12px] leading-relaxed text-warning-800">
              <strong className="font-semibold">Note:</strong>{" "}
              Driver&rsquo;s license data comes from official government records, while crime-related data is compiled from public court, tribunal, and law enforcement sources. Please avoid raising requests for minor spelling or formatting differences. Submit a cross-verification request only when there is a clear concern requiring review.
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                Reason <span className="text-danger-600">*</span>
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as SupportTicketReason)}
                disabled={submitting}
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-[13px] focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/10"
              >
                {REASON_ORDER.map((r) => (
                  <option key={r} value={r}>
                    {REASON_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                What did you observe? <span className="text-danger-600">*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={submitting}
                rows={5}
                placeholder="Describe the discrepancy you observed — e.g., name mismatch, photo mismatch, date of birth mismatch, or other inconsistencies with official records."
                className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/10"
              />
              <div className="mt-1 text-[11px] text-slate-500">
                Minimum 10 characters. This description will be reviewed exactly as written.
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                Notify me at <span className="text-danger-600">*</span>
              </label>
              <input
                type="email"
                value={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.value)}
                disabled={submitting}
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-[13px] focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/10"
              />
              <div className="mt-1 text-[11px] text-slate-500">
                We&rsquo;ll email you once this ticket is resolved.
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-[12.5px] text-danger-700">
                {error}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => !submitting && onClose()}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={submit}
              disabled={!canSubmit}
              leftIcon={<Flag className="h-3.5 w-3.5" />}
            >
              {submitting ? "Sending…" : "Send for cross-verification"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Small pill used on driver rows ────────────────────────────────────────────

export function CrossVerificationPill({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full bg-accent-50 px-2 py-0.5 text-[10.5px] font-semibold text-accent-700 ring-1 ring-inset ring-accent-200",
        className,
      )}
    >
      <Flag className="h-3 w-3" />
      Sent for cross-verification
    </span>
  );
}
