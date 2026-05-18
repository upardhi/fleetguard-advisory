import TopBar from "@/app/_components/TopBar";
import { Settings, Bell, Shield, Globe, Users } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar title="Settings" subtitle="Platform configuration and notification preferences" />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">

          {[
            {
              icon: Bell, title: "Notification Preferences",
              desc: "Configure how and when you receive disruption alerts.",
              items: [
                { label: "Critical disruption alerts", enabled: true },
                { label: "Daily risk summary (08:00 IST)", enabled: true },
                { label: "Safe corridor notifications", enabled: false },
              ]
            },
            {
              icon: Shield, title: "Risk Thresholds",
              desc: "Customize risk score thresholds for advisory triggers.",
              items: [
                { label: "Auto-hold threshold: Score ≥ 75", enabled: true },
                { label: "Auto-reroute threshold: Score ≥ 55", enabled: true },
                { label: "Night travel advisory", enabled: true },
              ]
            },
            {
              icon: Globe, title: "Monitored Regions",
              desc: "Select which regions to actively monitor for disruptions.",
              items: [
                { label: "North India (Delhi, Haryana, Punjab, UP)", enabled: true },
                { label: "West India (Maharashtra, Gujarat, Rajasthan)", enabled: true },
                { label: "South India (Karnataka, TN, AP, Telangana)", enabled: true },
                { label: "East India (WB, Odisha, Bihar, Jharkhand)", enabled: true },
              ]
            },
          ].map(({ icon: Icon, title, desc, items }) => (
            <div key={title} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                <Icon size={16} className="text-brand-600" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
                  <p className="text-xs text-slate-500">{desc}</p>
                </div>
              </div>
              <div className="p-5 space-y-3">
                {items.map(({ label, enabled }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-sm text-slate-700">{label}</span>
                    <div className={`w-10 h-5 rounded-full relative transition-colors ${enabled ? "bg-brand-600" : "bg-slate-200"}`}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${enabled ? "left-5" : "left-0.5"}`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <Users size={16} className="text-brand-600" />
              <div>
                <h2 className="text-sm font-semibold text-slate-800">Account & Team</h2>
                <p className="text-xs text-slate-500">Shared with your FleetGuard organisation account.</p>
              </div>
            </div>
            <div className="p-5">
              <p className="text-sm text-slate-600">
                User management, team members, and billing are managed through your main
                <span className="font-semibold text-brand-700"> FleetGuard</span> account.
                Settings changes here sync with your organisation profile.
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
