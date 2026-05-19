"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Fingerprint, Eye, EyeOff } from "lucide-react";
import { useAuthV2 } from "../_hooks/useAuthV2";

export function LoginForm() {
  const router = useRouter();
  const { signIn } = useAuthV2();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Please enter your email address.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setLoading(true);
    try {
      const result = await signIn(trimmedEmail, password);
      if (result.mfaRequired && result.preAuthToken) {
        router.push(`/login/mfa?token=${encodeURIComponent(result.preAuthToken)}`);
        return;
      }
      router.push("/auth/redirect");
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      let msg: string;
      if (status === 401) {
        msg = "Incorrect email or password. Please try again.";
      } else if (status === 423) {
        msg = "Too many failed attempts. Please wait a few minutes and try again.";
      } else if (status === 403) {
        msg = "This account has been disabled. Contact your administrator.";
      } else {
        msg = err instanceof Error ? err.message : "Sign-in failed. Please try again.";
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <label className="block">
        <span className="mb-1.5 block text-[12.5px] font-medium text-slate-700">Work email</span>
        <input
          type="email"
          placeholder="you@yourcompany.com"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-[14px] text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-[12.5px] font-medium text-slate-700">Password</span>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-[14px] text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 pr-11"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors focus:outline-none"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </label>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] text-red-700">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end text-[12.5px]">
        <Link href="/forgot-password" className="font-semibold text-brand-700 hover:text-brand-800">
          Forgot password?
        </Link>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="group flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-800 text-[14px] font-semibold text-white shadow-sm ring-1 ring-brand-900/10 transition hover:bg-brand-700 disabled:opacity-60"
      >
        {loading ? "Signing in…" : "Sign in"}
        {!loading && <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />}
      </button>

      {/* <div className="relative py-3">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            or
          </span>
        </div>
      </div> */}

      {/* <button
        type="button"
        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white text-[13.5px] font-semibold text-slate-700 hover:bg-slate-50"
      >
        <Fingerprint className="h-4 w-4" />
        Sign in with SSO (SAML)
      </button> */}
    </form>
  );
}