/**
 * FleetGuard — MSG91 SMS wrapper (server-only)
 * Used ONLY inside /api/* routes.
 * Never import this from a component, hook, page, or service file.
 */

import { thirdPartyFetch } from "@/app/_server/thirdParty/fetch";

interface SmsResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Sends a transactional SMS via MSG91.
 * The PIN is passed in as a variable and injected into the pre-approved template.
 * The plain PIN is never logged or stored by this function.
 */
export async function sendPinSms(params: {
  mobile: string;
  pin: string;
  tripCode: string;
}): Promise<SmsResult> {
  const authKey = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_TEMPLATE_ID;
  const senderId = process.env.MSG91_SENDER_ID ?? "FLEETG";

  if (!authKey || !templateId) {
    console.warn("[sms] MSG91 credentials not configured — skipping SMS send");
    return { ok: false, error: "MSG91 not configured" };
  }

  const mobile = params.mobile.startsWith("91") ? params.mobile : `91${params.mobile}`;

  try {
    const res = await thirdPartyFetch("https://control.msg91.com/api/v5/flow/", {
      _service: "msg91",
      _operation: "send_sms",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authkey: authKey,
      },
      body: JSON.stringify({
        template_id: templateId,
        short_url: "0",
        recipients: [
          {
            mobiles: mobile,
            var1: params.pin, // PIN variable in template
            var2: params.tripCode, // Trip code variable in template
          },
        ],
        sender: senderId,
      }),
    });

    const json = (await res.json()) as { type?: string; message?: string };

    if (json.type === "success") {
      return { ok: true, messageId: json.message };
    }
    return { ok: false, error: json.message ?? "Unknown error from MSG91" };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
