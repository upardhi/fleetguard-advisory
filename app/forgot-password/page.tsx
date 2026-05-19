"use client";

/**
 * Forgot password — self-service reset.
 *
 * Submits the email to /api/auth/forgot-password. The server only sends the
 * reset email when the account exists and is active. The UI always shows the
 * same confirmation regardless of outcome so we never leak which addresses
 * are on file.
 */

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Mail, Shield } from "lucide-react";
import { Logo } from "../_components/Logo";

export default function ForgotPasswordPage() {
  const [email, setEmail]       = useState("");
  const [submitting, setBusy]   = useState(false);
  const [submitted, setDone]    = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (res.status === 429) {
        setError("Too many attempts. Please try again in an hour.");
        return;
      }
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error ?? "Could not process request. Please try again.");
        return;
      }
      setDone(true);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1fr_1.1fr]">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden radial-glow-brand lg:block">
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        <div className="relative z-10 flex h-full flex-col justify-between p-12 text-slate-200">
          <Logo variant="light" />

          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-accent-500/30 bg-accent-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-300">
              <Shield className="h-3 w-3" />
              Account recovery
            </div>
            <h1 className="mt-5 max-w-md text-4xl font-semibold leading-tight tracking-tight text-white">
              Reset your
              <br />
              <span className="text-accent-300">password.</span>
            </h1>

            <p className="mt-4 max-w-md text-[13.5px] leading-relaxed text-slate-300">
              Enter the email address tied to your FleetGuard account. If your account is
              eligible for self-service reset, you&rsquo;ll receive an email with a secure
              link to set a new password.
            </p>
          </div>

          <div className="text-[11.5px] text-slate-400">
            © 2026 fraudcheck.ai · Compliance · Security · Command
          </div>
        </div>
      </div>

      {/* Content panel */}
      <div className="relative flex items-center justify-center bg-slate-50 px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-10 flex justify-center lg:hidden">
            <Logo />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-xs">
            {submitted ? (
              <SubmittedConfirmation />
            ) : (
              <>
                <div className="mb-6">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600">
                    Forgot your password?
                  </div>
                  <h2 className="mt-1 text-[22px] font-semibold tracking-tight text-slate-900">
                    Send me a reset link
                  </h2>
                  <p className="mt-1 text-[13px] text-slate-500">
                    We&rsquo;ll email a secure link to your registered address. The link expires
                    after a short window for security.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                  <div>
                    <label
                      htmlFor="email"
                      className="mb-1.5 block text-[12px] font-semibold text-slate-700"
                    >
                      Email address
                    </label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@company.com"
                        className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-[13.5px] shadow-xs focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
                      />
                    </div>
                  </div>

                  {error && (
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] text-red-700">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting || !email.trim()}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-800 text-[13.5px] font-semibold text-white shadow-sm ring-1 ring-brand-900/10 transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? "Sending…" : "Send reset link"}
                  </button>
                </form>

              </>
            )}

            <Link
              href="/login"
              className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white text-[13.5px] font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to sign in
            </Link>
          </div>

          <p className="mt-6 text-center text-[11px] text-slate-500">
            Reset attempts are rate-limited and logged for security.
          </p>
        </div>
      </div>
    </div>
  );
}

function SubmittedConfirmation() {
  return (
    <div>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success-50 text-success-700 ring-1 ring-success-200">
        <CheckCircle2 className="h-6 w-6" />
      </div>
      <h2 className="text-[22px] font-semibold tracking-tight text-slate-900">
        Check your inbox
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-slate-600">
        If your account is on file, a password-reset email has been sent to the address you
        entered. Open it and follow the link to set a new password.
      </p>
      <p className="mt-3 text-[12.5px] leading-relaxed text-slate-500">
        Didn&rsquo;t receive anything within a few minutes? Check your spam folder.
      </p>
    </div>
  );
}
