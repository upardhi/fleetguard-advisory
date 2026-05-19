"use client";

/**
 * Force password reset destination.
 *
 * Reached via /auth/redirect when /api/v2/me returns forcePasswordReset=true.
 * Successful change clears the flag server-side, then the user is bounced to
 * their role home.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { useAuthV2 } from "../../_hooks/useAuthV2";

const ROLE_HOME: Record<string, string> = {
  super_admin:      "/superadmin",
  superadmin:       "/superadmin",
  company_admin:    "/company",
  guard:            "/guard",
  wh_manager:       "/manager",
  regional_manager: "/manager",
  cso:              "/cso",
};

function passwordIssue(pw: string): string | null {
  if (pw.length < 8)            return "At least 8 characters";
  if (!/[A-Z]/.test(pw))        return "Add an uppercase letter";
  if (!/[a-z]/.test(pw))        return "Add a lowercase letter";
  if (!/[0-9]/.test(pw))        return "Add a digit";
  if (!/[^A-Za-z0-9]/.test(pw)) return "Add a special character";
  return null;
}

export default function ChangePasswordPage() {
  const { fgUser, loading } = useAuthV2();
  const router = useRouter();

  const [current, setCurrent]   = useState("");
  const [next, setNext]         = useState("");
  const [confirm, setConfirm]   = useState("");
  const [show, setShow]         = useState(false);
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState<string | null>(null);
  // Ref-based lock so two synchronous submits (Enter + click) can't both
  // pass the guard before React has flushed the busy state.
  const submittingRef            = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (!fgUser) router.replace("/login");
  }, [fgUser, loading, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // Guard against double-submit (Enter press + button click, fast double-click).
    // Without this, the second call hits the API after the first already changed
    // the password, and returns 401 even though the change succeeded.
    if (submittingRef.current) return;
    setError(null);
    const issue = passwordIssue(next);
    if (issue)            return setError(issue);
    if (next !== confirm) return setError("Passwords do not match");
    if (!current)         return setError("Enter your current (temporary) password");

    submittingRef.current = true;
    setBusy(true);
    try {
      let res: Response;
      try {
        res = await fetch("/api/v2/users/me/password", {
          method:      "POST",
          credentials: "include",
          headers:     { "Content-Type": "application/json" },
          body:        JSON.stringify({ currentPassword: current, newPassword: next }),
        });
      } catch {
        throw new Error("Can't reach the server. Check your connection and try again.");
      }

      // Defensive parse — server can return empty body on gateway timeouts.
      const text = await res.text();
      let json: { ok?: boolean; error?: string } = {};
      if (text) {
        try { json = JSON.parse(text); } catch { /* keep json = {} */ }
      }

      if (!res.ok) {
        const msg =
          json.error ??
          (res.status === 401 ? "The temporary password you entered is incorrect."
          : res.status === 422 ? "Password doesn't meet the strength requirements."
          : res.status === 429 ? "Too many attempts. Please wait a minute and try again."
          : res.status >= 500  ? "Server error. Please try again in a moment."
          : "Couldn't change your password. Please try again.");
        throw new Error(msg);
      }

      // Force a fresh /api/v2/me fetch so the cached forcePasswordReset clears.
      window.location.replace(ROLE_HOME[fgUser?.role ?? ""] ?? "/login");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Couldn't change your password. Please try again.");
      submittingRef.current = false;
      setBusy(false);
    }
  }

  if (loading || !fgUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <span className="text-[13px] text-slate-500">Loading…</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand-700">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-[16px] font-semibold text-slate-900">Set a new password</h1>
            <p className="mt-0.5 text-[12px] text-slate-500">
              For security, please change the temporary password sent to your email.
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Field label="Temporary password" htmlFor="cur">
            <PwInput id="cur" value={current} onChange={setCurrent} show={show} setShow={setShow} autoFocus />
          </Field>
          <Field label="New password" htmlFor="new">
            <PwInput id="new" value={next} onChange={setNext} show={show} setShow={setShow} hideToggle />
            <Strength pw={next} />
          </Field>
          <Field label="Confirm new password" htmlFor="cnf">
            <PwInput id="cnf" value={confirm} onChange={setConfirm} show={show} setShow={setShow} hideToggle />
          </Field>

          {error && (
            <div className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-[12.5px] text-danger-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="h-10 w-full rounded-lg bg-brand-600 text-[13.5px] font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Set new password"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[12px] font-semibold text-slate-700">{label}</label>
      {children}
    </div>
  );
}

function PwInput({
  id, value, onChange, show, setShow, autoFocus, hideToggle,
}: {
  id: string; value: string; onChange: (v: string) => void;
  show: boolean; setShow: (v: boolean) => void;
  autoFocus?: boolean; hideToggle?: boolean;
}) {
  // New / Confirm password fields hide the toggle so the user has to type
  // both correctly without peeking — defense against typos.
  const padRight = hideToggle ? "px-3" : "px-3 pr-10";
  return (
    <div className="relative">
      <input
        id={id}
        type={hideToggle ? "password" : (show ? "text" : "password")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        autoComplete={id === "cur" ? "current-password" : "new-password"}
        className={`h-10 w-full rounded-lg border border-slate-200 bg-slate-50 ${padRight} text-[13px] focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/10`}
      />
      {!hideToggle && (
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
          tabIndex={-1}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}

function Strength({ pw }: { pw: string }) {
  if (!pw) return null;
  const issue = passwordIssue(pw);
  return (
    <p className={`mt-1 text-[11.5px] ${issue ? "text-warning-700" : "text-success-700"}`}>
      {issue ?? "Looks good"}
    </p>
  );
}
