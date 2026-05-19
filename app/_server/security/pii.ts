// One-way display masking — does NOT decrypt; use encryption.ts for storage.

export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(1, local.length - 2))}${domain}`;
}

export function maskMobile(mobile: string): string {
  const digits = mobile.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  return `${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
}

export function maskDl(dl: string): string {
  if (dl.length <= 4) return "****";
  return `${dl.slice(0, 2)}${"*".repeat(dl.length - 4)}${dl.slice(-2)}`;
}

export function maskName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts
    .map((p) =>
      p.length <= 1 ? p : `${p[0]}${"*".repeat(p.length - 1)}`,
    )
    .join(" ");
}
