// RFC 9562 §5.7 — time-ordered UUID with 48-bit millisecond timestamp
export function uuidv7(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);

  const ms = BigInt(Date.now());
  buf[0] = Number((ms >> 40n) & 0xffn);
  buf[1] = Number((ms >> 32n) & 0xffn);
  buf[2] = Number((ms >> 24n) & 0xffn);
  buf[3] = Number((ms >> 16n) & 0xffn);
  buf[4] = Number((ms >> 8n) & 0xffn);
  buf[5] = Number(ms & 0xffn);

  // version 7
  buf[6] = (buf[6] & 0x0f) | 0x70;
  // variant 10xx
  buf[8] = (buf[8] & 0x3f) | 0x80;

  const hex = Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
  return (
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-` +
    `${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  );
}
