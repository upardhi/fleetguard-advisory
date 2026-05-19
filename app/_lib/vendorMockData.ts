const POLL_CLEAN: Record<string, unknown> = {
  total: 0,
  status: 1,
  cases: [],
};

export function getMockPollResponse(): {
  provider: string;
  raw: Record<string, unknown>;
} {
  return { provider: "wizer", raw: POLL_CLEAN };
}