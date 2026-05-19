"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthV2 } from "../../_hooks/useAuthV2";

function MfaForm() {
  const router = useRouter();
  const params = useSearchParams();
  const preAuthToken = params.get("token") ?? "";
  const { user } = useAuthV2();

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Already fully authenticated — go home
  useEffect(() => {
    if (user) router.replace("/auth/redirect");
  }, [user, router]);

  if (!preAuthToken) {
    return (
      <p className="text-[13px] text-slate-500">
        Invalid MFA session.{" "}
        <a href="/login" className="font-semibold text-brand-700">Sign in again</a>
      </p>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) { setError("Enter the 6-digit code from your authenticator app."); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/v2/mfa/verify", {
        method:      "POST",
        headers:     { "Content-Type": "application/json" },
        credentials: "include",
        body:        JSON.stringify({ preAuthToken, code }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(data.error ?? "Verification failed."); return; }
      router.push("/auth/redirect");
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <label className="block">
        <span className="mb-1.5 block text-[12.5px] font-medium text-slate-700">
          6-digit authenticator code
        </span>
        <input
          type="text"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          placeholder="000000"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          required
          className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-center text-[18px] tracking-widest text-slate-900 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
        />
      </label>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="flex h-11 w-full items-center justify-center rounded-lg bg-brand-800 text-[14px] font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
      >
        {loading ? "Verifying…" : "Verify"}
      </button>

      <p className="text-center text-[12px] text-slate-500">
        <a href="/login" className="font-semibold text-brand-700 hover:text-brand-800">
          Cancel
        </a>
      </p>
    </form>
  );
}

export default function MfaPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-[360px] rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-900/5">
        <h1 className="mb-1 text-[20px] font-semibold text-slate-900">Two-factor verification</h1>
        <p className="mb-6 text-[13px] text-slate-500">
          Open your authenticator app and enter the current code.
        </p>
        <Suspense fallback={<p className="text-[13px] text-slate-400">Loading…</p>}>
          <MfaForm />
        </Suspense>
      </div>
    </div>
  );
}
