"use client";
import TopBar from "@/app/_components/TopBar";
import RiskBadge from "@/app/_components/RiskBadge";
import { MOCK_DISRUPTIONS, MOCK_REGION_RISKS } from "@/app/_lib/mockData";
import { categoryIcon } from "@/app/_lib/utils";
import { Map, Info } from "lucide-react";

export default function RiskMapPage() {
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TopBar
        title="India Risk Map"
        subtitle="Real-time disruption heatmap across national highway corridors"
      />

      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-4 max-w-screen-2xl mx-auto">

          <div className="grid xl:grid-cols-4 gap-6">
            {/* Map */}
            <div className="xl:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Map size={15} className="text-brand-600" />
                  <h2 className="text-sm font-semibold text-slate-800">National Highway Disruption Overlay</h2>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Info size={12} />
                  Live data — updates every 5 minutes
                </div>
              </div>

              <div className="relative p-6" style={{ minHeight: 560 }}>
                <svg viewBox="0 0 600 680" className="w-full h-full" style={{ maxHeight: 560 }}>
                  {/* India base */}
                  <path
                    d="M 215 48 L 238 35 L 275 30 L 320 42 L 368 65 L 405 95 L 425 128 L 438 162 L 440 198 L 455 232 L 468 268 L 472 308 L 462 345 L 445 378 L 425 408 L 400 432 L 375 455 L 348 478 L 322 502 L 300 528 L 284 555 L 272 578 L 258 555 L 240 530 L 220 508 L 198 488 L 175 465 L 155 442 L 138 418 L 122 392 L 110 362 L 105 330 L 108 298 L 115 268 L 122 240 L 120 212 L 125 185 L 133 158 L 148 130 L 165 106 L 185 83 L 202 64 Z"
                    fill="#dbeafe"
                    stroke="#93c5fd"
                    strokeWidth="1.5"
                  />

                  {/* Major highways */}
                  {/* NH44 — Delhi to Kanyakumari */}
                  <path d="M 268 62 L 262 108 L 258 155 L 268 215 L 275 280 L 280 345 L 285 405 L 290 460 L 295 520 L 300 565" stroke="#475569" strokeWidth="2.5" fill="none" strokeDasharray="8,4" opacity="0.7" />
                  <text x="300" y="75" fontSize="9" fill="#475569" fontWeight="700" transform="rotate(-15,300,75)">NH44</text>

                  {/* NH48 — Delhi to Chennai */}
                  <path d="M 248 88 L 220 145 L 195 210 L 178 270 L 168 330 L 175 395 L 188 450 L 212 510" stroke="#475569" strokeWidth="2" fill="none" strokeDasharray="8,4" opacity="0.6" />
                  <text x="155" y="290" fontSize="8" fill="#475569" fontWeight="600">NH48</text>

                  {/* NH27 — East-West */}
                  <path d="M 130 258 L 180 252 L 240 248 L 310 252 L 380 255 L 438 268" stroke="#475569" strokeWidth="2" fill="none" strokeDasharray="8,4" opacity="0.6" />
                  <text x="288" y="245" fontSize="8" fill="#475569" fontWeight="600">NH27</text>

                  {/* NH16 — Kolkata-Chennai */}
                  <path d="M 388 215 L 405 265 L 415 315 L 408 365 L 395 412" stroke="#475569" strokeWidth="2" fill="none" strokeDasharray="8,4" opacity="0.5" />
                  <text x="418" y="295" fontSize="8" fill="#475569" fontWeight="600">NH16</text>

                  {/* Risk Zone Overlays */}
                  {/* Haryana — Critical */}
                  <ellipse cx="262" cy="128" rx="32" ry="24" fill="rgba(239,68,68,0.25)" stroke="#ef4444" strokeWidth="2" />
                  <circle cx="262" cy="128" r="7" fill="#ef4444" />
                  <text x="296" y="122" fontSize="10" fill="#991b1b" fontWeight="800">Haryana</text>
                  <text x="296" y="134" fontSize="8" fill="#dc2626">NH44 BLOCKED</text>

                  {/* Odisha — Critical */}
                  <ellipse cx="405" cy="355" rx="28" ry="22" fill="rgba(239,68,68,0.25)" stroke="#ef4444" strokeWidth="2" />
                  <circle cx="405" cy="355" r="7" fill="#ef4444" />
                  <text x="435" y="349" fontSize="10" fill="#991b1b" fontWeight="800">Odisha</text>
                  <text x="435" y="361" fontSize="8" fill="#dc2626">CYCLONE</text>

                  {/* Maharashtra — High */}
                  <ellipse cx="200" cy="335" rx="26" ry="20" fill="rgba(249,115,22,0.25)" stroke="#f97316" strokeWidth="2" />
                  <circle cx="200" cy="335" r="6" fill="#f97316" />
                  <text x="145" y="330" fontSize="10" fill="#7c2d12" fontWeight="700">Mah.</text>
                  <text x="135" y="342" fontSize="8" fill="#ea580c">HIGH RISK</text>

                  {/* Karnataka — High */}
                  <ellipse cx="235" cy="460" rx="22" ry="18" fill="rgba(249,115,22,0.2)" stroke="#f97316" strokeWidth="1.5" />
                  <circle cx="235" cy="460" r="5.5" fill="#f97316" />
                  <text x="260" y="455" fontSize="10" fill="#7c2d12" fontWeight="700">Karnataka</text>
                  <text x="260" y="467" fontSize="8" fill="#ea580c">VVIP MOVE</text>

                  {/* Rajasthan — High */}
                  <ellipse cx="172" cy="215" rx="22" ry="18" fill="rgba(249,115,22,0.2)" stroke="#f97316" strokeWidth="1.5" />
                  <circle cx="172" cy="215" r="5.5" fill="#f97316" />
                  <text x="124" y="210" fontSize="10" fill="#7c2d12" fontWeight="700">Raj.</text>
                  <text x="115" y="222" fontSize="8" fill="#ea580c">SECURITY</text>

                  {/* UP — Medium */}
                  <ellipse cx="338" cy="195" rx="20" ry="15" fill="rgba(245,158,11,0.2)" stroke="#f59e0b" strokeWidth="1.5" />
                  <circle cx="338" cy="195" r="5" fill="#f59e0b" />
                  <text x="360" y="190" fontSize="10" fill="#78350f" fontWeight="700">UP</text>
                  <text x="357" y="202" fontSize="8" fill="#d97706">MEDIUM</text>

                  {/* Assam — Medium */}
                  <ellipse cx="455" cy="175" rx="18" ry="14" fill="rgba(245,158,11,0.2)" stroke="#f59e0b" strokeWidth="1.5" />
                  <circle cx="455" cy="175" r="4.5" fill="#f59e0b" />
                  <text x="455" y="160" fontSize="9" fill="#92400e" fontWeight="700">Assam</text>

                  {/* Tamil Nadu — Safe */}
                  <ellipse cx="278" cy="558" rx="18" ry="14" fill="rgba(34,197,94,0.2)" stroke="#22c55e" strokeWidth="1.5" />
                  <circle cx="278" cy="558" r="4.5" fill="#22c55e" />
                  <text x="294" y="553" fontSize="9" fill="#14532d" fontWeight="700">TN</text>
                  <text x="290" y="563" fontSize="8" fill="#16a34a">SAFE</text>

                  {/* Gujarat — Safe */}
                  <ellipse cx="140" cy="278" rx="18" ry="14" fill="rgba(34,197,94,0.2)" stroke="#22c55e" strokeWidth="1.5" />
                  <circle cx="140" cy="278" r="4.5" fill="#22c55e" />
                  <text x="110" y="265" fontSize="9" fill="#14532d" fontWeight="700">Gujarat</text>

                  {/* City dots */}
                  {[
                    { name: "Delhi",      cx: 262, cy: 88 },
                    { name: "Mumbai",     cx: 165, cy: 318 },
                    { name: "Chennai",    cx: 300, cy: 528 },
                    { name: "Kolkata",    cx: 400, cy: 225 },
                    { name: "Bengaluru",  cx: 248, cy: 488 },
                    { name: "Hyderabad",  cx: 295, cy: 405 },
                  ].map(({ name, cx, cy }) => (
                    <g key={name}>
                      <circle cx={cx} cy={cy} r="3" fill="#1e3a5f" />
                      <text x={cx + 5} y={cy + 4} fontSize="7.5" fill="#1e3a5f" fontWeight="600">{name}</text>
                    </g>
                  ))}

                  {/* Legend */}
                  <g transform="translate(12, 460)">
                    <rect x="0" y="0" width="110" height="120" rx="8" fill="white" fillOpacity="0.95" stroke="#e2e8f0" strokeWidth="1" />
                    <text x="10" y="16" fontSize="8" fill="#475569" fontWeight="700" letterSpacing="0.5">RISK LEVEL</text>
                    {[
                      { label: "Critical", color: "#ef4444", y: 32 },
                      { label: "High",     color: "#f97316", y: 48 },
                      { label: "Medium",   color: "#f59e0b", y: 64 },
                      { label: "Low",      color: "#22c55e", y: 80 },
                      { label: "Safe",     color: "#15803d", y: 96 },
                    ].map(({ label, color, y }) => (
                      <g key={label}>
                        <circle cx="18" cy={y} r="5" fill={color} opacity="0.8" />
                        <text x="30" y={y + 4} fontSize="9" fill="#475569">{label}</text>
                      </g>
                    ))}
                  </g>
                </svg>
              </div>
            </div>

            {/* Right: Region list */}
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100">
                  <h2 className="text-sm font-semibold text-slate-800">Region Risk Status</h2>
                </div>
                <div className="divide-y divide-slate-100">
                  {MOCK_REGION_RISKS.map((r) => (
                    <div key={r.region} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">{r.region}</p>
                        <p className="text-[11px] text-slate-400 truncate">{r.state}</p>
                      </div>
                      <RiskBadge level={r.riskLevel} size="xs" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100">
                  <h2 className="text-sm font-semibold text-slate-800">Active Events</h2>
                </div>
                <div className="divide-y divide-slate-100">
                  {MOCK_DISRUPTIONS.slice(0, 5).map((d) => (
                    <div key={d.id} className="flex items-center gap-2 px-4 py-2.5">
                      <span className="text-base shrink-0">{categoryIcon(d.category)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-700 truncate">{d.region}</p>
                        <p className="text-[11px] text-slate-400 truncate">{d.highway ?? "Multiple roads"}</p>
                      </div>
                      <RiskBadge level={d.risk} size="xs" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
