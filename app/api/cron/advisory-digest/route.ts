import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_server/db/client";
import { sendMail } from "@/app/_lib/sendMail";
import { wrapEmail, escapeHtml, emailDivider, emailButton } from "@/app/_lib/emailLayout";

export const maxDuration = 120;

/**
 * POST /api/cron/advisory-digest
 *
 * Fires once daily (configured in vercel.json).
 * For every user who has an ops-region preference, builds a morning intelligence
 * briefing email summarising that region's current disruptions and sends it.
 *
 * Deduplication: we skip sending if a digest was already sent to this user
 * within the last 20 hours (handles cron drift without double-sending).
 */
export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get("x-vercel-cron-auth") ?? "";
  if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const today = new Date().toISOString().slice(0, 10);

  // Find all users who have a region preference (and thus opted into alerts)
  const subscribers = (await db`
    SELECT
      p.user_id,
      p.region_id,
      p.org_id,
      u.email,
      u.full_name,
      r.label  AS region_label,
      r.color  AS region_color,
      r.states AS region_states
    FROM   adv_user_prefs p
    JOIN   users          u ON u.id = p.user_id
    JOIN   adv_regions    r ON r.id = p.region_id
    WHERE  p.region_id IS NOT NULL
      AND  u.email IS NOT NULL
      AND  u.email != ''
    ORDER  BY p.user_id
  `) as unknown as {
    user_id: string;
    region_id: string;
    org_id: string;
    email: string;
    full_name: string | null;
    region_label: string;
    region_color: string;
    region_states: string[];
  }[];

  if (subscribers.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: "No subscribers" });
  }

  let sent = 0;
  let skipped = 0;

  for (const sub of subscribers) {
    // Dedup: skip if already sent today
    const [recentDigest] = await db`
      SELECT 1 FROM adv_notifications
      WHERE  user_id = ${sub.user_id}
        AND  title LIKE 'Morning Digest:%'
        AND  created_at > now() - interval '20 hours'
      LIMIT 1
    ` as unknown as unknown[];

    if (recentDigest) {
      skipped++;
      continue;
    }

    // Load this region's disruptions
    const disruptions = (await db`
      SELECT
        s.disruption_title,
        s.disruption_summary,
        s.disruption_risk_level,
        s.disruption_eta_hours,
        s.disruption_category,
        s.state,
        r.name AS route_name,
        r.id   AS route_id
      FROM   adv_watched_segments s
      JOIN   adv_watched_routes   r ON r.id = s.watched_route_id
      WHERE  r.org_id = ${sub.org_id}
        AND  r.is_active = true
        AND  s.has_disruption = true
        AND  s.disruption_risk_level IN ('critical', 'high')
        AND  s.state = ANY(${db.array(sub.region_states)})
      ORDER BY
        CASE s.disruption_risk_level WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,
        s.disruption_eta_hours DESC NULLS LAST
      LIMIT 20
    `) as unknown as {
      disruption_title: string | null;
      disruption_summary: string | null;
      disruption_risk_level: string;
      disruption_eta_hours: number | null;
      disruption_category: string | null;
      state: string | null;
      route_name: string;
      route_id: string;
    }[];

    const critical = disruptions.filter((d) => d.disruption_risk_level === "critical").length;
    const high     = disruptions.filter((d) => d.disruption_risk_level === "high").length;
    const total    = disruptions.length;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://fleetguard.fraudcheck.ai";
    const regionUrl = `${appUrl}/advisory/regions/${sub.region_id}`;

    const firstName = sub.full_name?.split(" ")[0] ?? "there";
    const dateLabel = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

    // ── Build email body ────────────────────────────────────────────────────
    const riskBadge = (level: string) => {
      const bg   = level === "critical" ? "#ef4444" : level === "high" ? "#f97316" : "#eab308";
      const text = level.charAt(0).toUpperCase() + level.slice(1);
      return `<span style="display:inline-block;padding:1px 7px;border-radius:4px;background:${bg};color:#fff;font-size:11px;font-weight:700;letter-spacing:0.04em;vertical-align:middle;">${escapeHtml(text)}</span>`;
    };

    let disruptionRows = "";
    if (disruptions.length === 0) {
      disruptionRows = `
        <p style="color:#475569;font-size:14px;padding:20px 0;text-align:center;">
          ✅ No critical or high disruptions in your region today.
        </p>`;
    } else {
      for (const d of disruptions) {
        const title   = d.disruption_title ?? `Disruption on ${d.route_name}`;
        const summary = d.disruption_summary ?? "";
        const eta     = d.disruption_eta_hours ? ` · ~${d.disruption_eta_hours}h delay` : "";
        const state   = d.state ? `<span style="color:#94a3b8;font-size:12px;"> — ${escapeHtml(d.state)}</span>` : "";
        disruptionRows += `
          <div style="border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;margin-bottom:10px;background:#fff;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
              ${riskBadge(d.disruption_risk_level)}
              <span style="font-size:13px;font-weight:600;color:#0f172a;">${escapeHtml(title)}</span>
              ${state}
            </div>
            ${summary ? `<p style="margin:0 0 6px;font-size:13px;color:#475569;line-height:1.5;">${escapeHtml(summary)}</p>` : ""}
            <div style="font-size:12px;color:#94a3b8;">
              ${escapeHtml(d.route_name)}${escapeHtml(eta)}
              ${d.disruption_category ? ` · ${escapeHtml(d.disruption_category)}` : ""}
            </div>
          </div>`;
      }
    }

    const summaryLine = total === 0
      ? "All corridors are clear 🟢"
      : `${critical > 0 ? `<strong style="color:#ef4444;">${critical} critical</strong>` : ""}${critical > 0 && high > 0 ? " · " : ""}${high > 0 ? `<strong style="color:#f97316;">${high} high</strong>` : ""} disruption${total === 1 ? "" : "s"} in ${escapeHtml(sub.region_label)}`;

    const bodyHtml = `
      <p style="font-size:15px;color:#0f172a;margin:0 0 4px;">Hi ${escapeHtml(firstName)},</p>
      <p style="font-size:14px;color:#475569;margin:0 0 20px;">
        Here is your morning intelligence brief for <strong>${escapeHtml(sub.region_label)}</strong> — ${escapeHtml(dateLabel)}.
      </p>

      <!-- Summary strip -->
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 18px;margin-bottom:24px;font-size:14px;color:#0f172a;">
        ${summaryLine}
      </div>

      ${disruptionRows}

      ${emailDivider()}

      ${emailButton({ href: regionUrl, label: `Open ${sub.region_label} Dashboard` })}

      <p style="font-size:12px;color:#94a3b8;margin-top:16px;">
        You are receiving this because you are assigned to <strong>${escapeHtml(sub.region_label)}</strong>.
        Update your region preference in your advisory profile.
      </p>`;

    const html = wrapEmail({
      preheader: total === 0
        ? `${sub.region_label} is clear today — no critical disruptions`
        : `${total} disruption${total === 1 ? "" : "s"} in ${sub.region_label} — ${critical} critical, ${high} high`,
      heading: `Morning Digest — ${sub.region_label}`,
      body: bodyHtml,
      footerNote: "Automated daily advisory digest. Reply to this address to reach support.",
    });

    const result = await sendMail({
      to: sub.email,
      subject: `[FleetGuard] Morning Digest: ${sub.region_label} — ${dateLabel}`,
      html,
    });

    if (result.success) {
      sent++;
      // Record a sentinel notification so dedup works next time
      await db`
        INSERT INTO adv_notifications
          (id, org_id, user_id, region_id, title, body, risk_level, category, is_read)
        VALUES (
          ${crypto.randomUUID()}, ${sub.org_id}, ${sub.user_id}, ${sub.region_id},
          ${`Morning Digest: ${sub.region_label} — ${dateLabel}`},
          ${`${total} disruption${total === 1 ? "" : "s"} (${critical} critical, ${high} high)`},
          ${critical > 0 ? "critical" : high > 0 ? "high" : "safe"},
          ${"digest"},
          ${true}
        )
      `;
    } else {
      console.error(`[advisory-digest] failed to send to ${sub.email}:`, result.error);
    }
  }

  return NextResponse.json({
    ok: true,
    date: today,
    sent,
    skipped,
    total: subscribers.length,
  });
}
