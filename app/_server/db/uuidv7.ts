export function uuidv7(): string {
  const now = Date.now();
  const ms = BigInt(now);
  const rand = crypto.getRandomValues(new Uint8Array(10));
  const hi = (ms >> 12n) & 0xffffffffffffn;
  const lo = ms & 0xfffn;
  rand[0] = Number((hi >> 40n) & 0xffn);
  rand[1] = Number((hi >> 32n) & 0xffn);
  rand[2] = Number((hi >> 24n) & 0xffn);
  rand[3] = Number((hi >> 16n) & 0xffn);
  rand[4] = Number((hi >> 8n) & 0xffn);
  rand[5] = Number(hi & 0xffn);
  rand[6] = (Number((lo >> 8n) & 0xfn) | 0x70);
  rand[7] = Number(lo & 0xffn);
  rand[8] = (rand[8] & 0x3f) | 0x80;
  const hex = Array.from(rand).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,18)}-${hex.slice(18)}`;
}
