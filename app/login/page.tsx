import Link from "next/link";
import { Shield, Truck, Users } from "lucide-react";
import { Logo } from "../_components/Logo";
import { LoginForm } from "../_components/LoginForm";

export default function LoginPage() {
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
              AI-powered logistics intelligence
            </div>
            <h1 className="mt-5 max-w-md text-4xl font-semibold leading-tight tracking-tight text-white">
              Monitor every corridor.
              <br />
              <span className="text-accent-300">Anticipate every disruption.</span>
            </h1>

            <p className="mt-4 max-w-md text-[13.5px] leading-relaxed text-slate-300">
              FleetAdvisory helps logistics teams monitor highways, political events, weather risks, strikes, and corridor disruptions with AI-powered intelligence, live risk scoring, route advisories, and operational recommendations.
            </p>

            <div className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-white/10 pt-6">
              <Stat label="Corridors Monitored" value="500+" />
              <Stat label="Disruptions Tracked" value="10k+" />
              <Stat label="Advisories / Day" value="2k+" />
            </div>
          </div>

          <div className="text-[11.5px] text-slate-400">
            © 2026 fraudcheck.ai · AI Logistics Intelligence Platform
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="relative flex items-center justify-center bg-slate-50 px-6 py-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-10 flex justify-center">
            <Logo />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-xs">
            <div className="mb-6">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600">
                Welcome back
              </div>
              <h2 className="mt-1 text-[22px] font-semibold tracking-tight text-slate-900">
                Sign in to FleetAdvisory
              </h2>
              <p className="mt-1 text-[13px] text-slate-500">
                Use your work email to access corridor intelligence, disruptions, and operational advisories.
              </p>
            </div>

            <LoginForm />
          </div>

          {/* Quick persona entry — POC convenience */}
          {/* <div className="mt-6">
            <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              POC quick access
            </div>
            <div className="grid grid-cols-3 gap-2">
              <QuickRole href="/guard" icon={Users} label="Guard" />
              <QuickRole href="/manager" icon={Truck} label="Manager" />
              <QuickRole href="/cso" icon={Shield} label="CSO" />
            </div>
          </div> */}

          <p className="mt-6 text-center text-[11px] text-slate-500">
            By signing in, you agree to FraudCheck.ai&apos;s{" "}
            <a
              className="font-semibold text-slate-700"
              href="https://www.fraudcheck.ai/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
            >
              Privacy Policy
            </a>{" "}
            and Acceptable Use Policy. All disruption intelligence and advisories are monitored and auditable.
          </p>
        </div>
      </div>
    </div>
  );
}

function QuickRole({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[12.5px] font-semibold text-slate-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800"
    >
      <Icon className="h-3.5 w-3.5 text-slate-500 group-hover:text-brand-700" />
      {label}
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="num text-xl font-semibold text-white">{value}</div>
      <div className="text-[10.5px] uppercase tracking-[0.12em] text-slate-400">{label}</div>
    </div>
  );
}
