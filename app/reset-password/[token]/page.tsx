"use client";

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Lock, ShieldCheck } from "lucide-react";
import { Logo } from "../../_components/Logo";

export default function ResetPasswordPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params?.token;

  const [pw, setPw]               = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [submitting, setBusy]     = useState(false);
  const [submitted, setDone]      = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // Auto-redirect to /login after 4 seconds on success.
  useEffect(() => {
    if (!submitted) return;
    const t = setTimeout(() => router.push("/login"), 4000);
    return () => clearTimeout(t);
  }, [submitted, router]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (pw !== confirmPw) {
      setError("Passwords do not match");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: pw }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(json.error ?? "Could not reset password. The link may have expired.");
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
              <ShieldCheck className="h-3 w-3" />
              Set new password
            </div>
            <h1 className="mt-5 max-w-md text-4xl font-semibold leading-tight tracking-tight text-white">
              Choose a strong
              <br />
              <span className="text-accent-300">new password.</span>
            </h1>
            <p className="mt-4 max-w-md text-[13.5px] leading-relaxed text-slate-300">
              Use at least 8 characters including upper- and lower-case letters,
              a digit, and a special character.
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
              <div>
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success-50 text-success-700 ring-1 ring-success-200">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h2 className="text-[22px] font-semibold tracking-tight text-slate-900">
                  Password updated
                </h2>
                <p className="mt-2 text-[13px] leading-relaxed text-slate-600">
                  Your password has been changed. Redirecting you to the sign-in page…
                </p>
                <Link
                  href="/login"
                  className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-800 text-[13.5px] font-semibold text-white shadow-sm ring-1 ring-brand-900/10 transition hover:bg-brand-700"
                >
                  Sign in now
                </Link>
              </div>
            ) : (
              <>
                <div className="mb-6">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600">
                    Set a new password
                  </div>
                  <h2 className="mt-1 text-[22px] font-semibold tracking-tight text-slate-900">
                    Reset your password
                  </h2>
                  <p className="mt-1 text-[13px] text-slate-500">
                    Enter the new password you&rsquo;d like to use for your FleetGuard account.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                  <div>
                    <label htmlFor="pw" className="mb-1.5 block text-[12px] font-semibold text-slate-700">
                      New password
                    </label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="pw"
                        type="password"
                        autoComplete="new-password"
                        required
                        minLength={8}
                        value={pw}
                        onChange={(e) => setPw(e.target.value)}
                        className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-[13.5px] shadow-xs focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="confirm" className="mb-1.5 block text-[12px] font-semibold text-slate-700">
                      Confirm password
                    </label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="confirm"
                        type="password"
                        autoComplete="new-password"
                        required
                        minLength={8}
                        value={confirmPw}
                        onChange={(e) => setConfirmPw(e.target.value)}
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
                    disabled={submitting || !pw || !confirmPw}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-800 text-[13.5px] font-semibold text-white shadow-sm ring-1 ring-brand-900/10 transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? "Updating…" : "Update password"}
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
        </div>
      </div>
    </div>
  );
}
