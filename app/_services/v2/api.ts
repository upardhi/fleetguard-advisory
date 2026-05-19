/**
 * Base fetch helper for v2 API routes.
 * Always includes credentials (cookies) and sets Content-Type on POST/PATCH/PUT.
 */

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  get:   <T>(path: string)                   => request<T>(path, { method: "GET" }),
  post:  <T>(path: string, body: unknown, headers?: Record<string, string>) =>
    request<T>(path, { method: "POST",  body: JSON.stringify(body), headers }),
  patch: <T>(path: string, body: unknown, headers?: Record<string, string>) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body), headers }),
  del:   <T>(path: string)                   => request<T>(path, { method: "DELETE" }),
};
