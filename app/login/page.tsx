import LoginForm from "@/app/_components/LoginForm";
import Logo from "@/app/_components/Logo";
import { ShieldCheck, MapPin, Zap } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex radial-glow">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12 text-white">
        <div>
          <Logo />
        </div>

        <div className="space-y-8">
          <div>
            <h2 className="text-3xl font-bold leading-tight mb-4">
              Enterprise Route
              <br />
              <span className="text-accent-400">Advisory Intelligence</span>
            </h2>
            <p className="text-brand-200 text-base leading-relaxed max-w-md">
              Pre-dispatch disruption intelligence for logistics control towers.
              Know what&apos;s happening before your vehicles move.
            </p>
          </div>

          <div className="space-y-4">
            {[
              { icon: ShieldCheck, text: "Real-time disruption monitoring across 600+ national highways" },
              { icon: MapPin,      text: "Region-level risk scoring with safe corridor identification" },
              { icon: Zap,         text: "AI-powered dispatch advisories 6–24 hours ahead" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                  <Icon size={15} className="text-accent-400" />
                </div>
                <p className="text-brand-100 text-sm leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-6 text-brand-300 text-xs">
          <span>Powered by FleetGuard</span>
          <span>·</span>
          <span>Enterprise Grade</span>
          <span>·</span>
          <span>99.9% Uptime</span>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            {/* Mobile logo */}
            <div className="lg:hidden mb-6">
              <Logo collapsed={false} />
            </div>

            <div className="mb-6">
              <h1 className="text-xl font-bold text-slate-900">Welcome back</h1>
              <p className="text-slate-500 text-sm mt-1">
                Sign in with your FleetGuard credentials
              </p>
            </div>

            <LoginForm />

            <p className="text-center text-xs text-slate-400 mt-6">
              Same login as your FleetGuard account
            </p>
          </div>

          <p className="text-center text-brand-200 text-xs mt-6">
            © {new Date().getFullYear()} RouteGuard Advisory. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
