"use client";

/**
 * FleetGuard — useAuthV2
 * JWT-cookie auth hook. Replaces Firebase-based useAuth.
 * Uses module-level cache + subscriber pattern so all components share one copy
 * of the auth state without independent fetches on each mount.
 */

import { useEffect, useState } from "react";
import type { UserRole } from "../_lib/types";

export interface UserProfileV2 {
  uid:         string;
  email:       string;
  displayName: string;
  role:        UserRole;
  warehouseId:  string;
  warehouseIds?: string[];
  orgId:        string;
  isActive:     boolean;
  mfaRequired:  boolean;
  /** True when an admin issued/reset the password and the user must change it on next login. */
  forcePasswordReset?: boolean;
  // Added for FgUser compatibility — populated from /api/v2/me
  createdAt:    string;
  updatedAt:    string;
}

export interface AuthStateV2 {
  user:    UserProfileV2 | null;
  // Alias used by existing components that destructure `fgUser`
  fgUser:  UserProfileV2 | null;
  loading: boolean;
  error:   string | null;
}

// ── Module-level shared state ─────────────────────────────────────────────────

let cache: AuthStateV2 = { user: null, fgUser: null, loading: true, error: null };
const subscribers = new Set<(s: AuthStateV2) => void>();

function broadcast(next: AuthStateV2) {
  cache = next;
  subscribers.forEach((fn) => fn(next));
}

let initialized = false;

async function fetchMe(): Promise<UserProfileV2 | null> {
  const res = await fetch("/api/v2/me", { credentials: "include" });
  if (res.status === 401 || res.status === 404) return null;
  if (!res.ok) throw new Error(`/api/v2/me returned ${res.status}`);
  return res.json() as Promise<UserProfileV2>;
}

function initializeOnce() {
  if (initialized) return;
  initialized = true;

  fetchMe()
    .then((user) => broadcast({ user, fgUser: user, loading: false, error: null }))
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to load session";
      broadcast({ user: null, fgUser: null, loading: false, error: msg });
    });
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuthV2(): AuthStateV2 & {
  signIn:  (email: string, password: string) => Promise<{ mfaRequired?: boolean; preAuthToken?: string }>;
  logOut:  () => Promise<void>;
} {
  const [state, setState] = useState<AuthStateV2>(cache);

  useEffect(() => {
    initializeOnce();
    subscribers.add(setState);
    setState(cache);
    return () => { subscribers.delete(setState); };
  }, []);

  async function signIn(email: string, password: string) {
    broadcast({ ...cache, loading: true, error: null });
    try {
      const res = await fetch("/api/auth/v2/login", {
        method:      "POST",
        headers:     { "Content-Type": "application/json" },
        credentials: "include",
        body:        JSON.stringify({ email, password }),
      });

      // Some failure modes (gateway timeout, server crash, CORS preflight)
      // return an empty body. Read as text first and parse defensively so we
      // surface a readable error instead of "Unexpected end of JSON input".
      const text = await res.text();
      let data: {
        ok?: boolean;
        mfaRequired?: boolean;
        preAuthToken?: string;
        error?: string;
        user?: UserProfileV2;
      } = {};
      if (text) {
        try { data = JSON.parse(text); }
        catch { /* keep data = {}; we'll fall through to the default message below */ }
      }

      if (!res.ok) {
        const msg = data.error
          ?? (res.status === 0  ? "Cannot reach the server. Check your connection and try again."
            : res.status === 401 ? "Invalid email or password."
            : res.status === 429 ? "Too many attempts. Please wait a few minutes and try again."
            : res.status >= 500  ? "Server error. Please try again in a moment."
            : `Login failed (${res.status})`);
        broadcast({ user: null, fgUser: null, loading: false, error: msg });
        throw Object.assign(new Error(msg), { status: res.status, code: `http/${res.status}` });
      }

      // MFA flow — cookies are NOT yet issued; caller redirects to /login/mfa
      if (data.mfaRequired) {
        broadcast({ ...cache, loading: false });
        return { mfaRequired: true, preAuthToken: data.preAuthToken };
      }

      // Full login — the login response already includes the full profile, so
      // we can populate state immediately without a second /api/v2/me round
      // trip. Fall back to fetchMe() only if an older server build is somehow
      // returning the legacy minimal payload.
      const user = data.user ?? (await fetchMe());
      broadcast({ user, fgUser: user, loading: false, error: null });
      return {};
    } catch (err: unknown) {
      broadcast({ user: null, fgUser: null, loading: false, error: null });
      throw err;
    }
  }

  async function logOut() {
    await fetch("/api/auth/v2/logout", { method: "POST", credentials: "include" });
    broadcast({ user: null, fgUser: null, loading: false, error: null });
  }

  return { ...state, signIn, logOut };
}
