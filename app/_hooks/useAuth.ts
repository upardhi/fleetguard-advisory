"use client";

/**
 * FleetGuard — useAuth hook
 * Tracks Firebase Auth state + fetches the user's FgUser profile from fg_users.
 *
 * Uses a module-scoped cache + subscriber pattern so state is shared across
 * every call to useAuth() in the app. Without this, every component that calls
 * useAuth() would subscribe to Firebase Auth independently and re-fetch the
 * fg_users doc on every mount — causing a flash of "empty profile" when the
 * user navigates between pages.
 */

import { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  User,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth } from "../_lib/firebase";
import { getUserById } from "../_services/userService";
import type { FgUser } from "../_services/userService";

export interface AuthState {
  firebaseUser: User | null;
  fgUser: FgUser | null;
  loading: boolean;
  error: string | null;
}

// ── Shared module-level store ────────────────────────────────────────────────

let cachedState: AuthState = {
  firebaseUser: null,
  fgUser: null,
  loading: true,
  error: null,
};

const listeners = new Set<(s: AuthState) => void>();

function setCachedState(next: AuthState) {
  cachedState = next;
  listeners.forEach((fn) => fn(next));
}

let initialized = false;

function initializeOnce() {
  if (initialized) return;
  initialized = true;

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      setCachedState({ firebaseUser: null, fgUser: null, loading: false, error: null });
      return;
    }

    // Keep the old fgUser around while we re-fetch so the UI doesn't flash empty.
    setCachedState({
      firebaseUser: user,
      fgUser: cachedState.fgUser && cachedState.fgUser.uid === user.uid ? cachedState.fgUser : null,
      loading: cachedState.fgUser?.uid !== user.uid,
      error: null,
    });

    try {
      const fgUser = await getUserById(user.uid);
      setCachedState({ firebaseUser: user, fgUser, loading: false, error: null });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load user profile";
      setCachedState({ firebaseUser: user, fgUser: null, loading: false, error: msg });
    }
  });
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthState & {
  signIn: (email: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
} {
  const [state, setState] = useState<AuthState>(cachedState);

  useEffect(() => {
    initializeOnce();
    listeners.add(setState);
    // Sync in case the cache moved between render and mount.
    setState(cachedState);
    return () => {
      listeners.delete(setState);
    };
  }, []);

  async function signIn(email: string, password: string) {
    setCachedState({ ...cachedState, loading: true, error: null });
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      // Fully resolve the fg_users profile here before returning so the
      // caller can navigate as soon as signIn() resolves. Without this the
      // onAuthStateChanged callback would still be mid-await on getUserById
      // when LoginForm pushes to /auth/redirect, leaving the new page mounted
      // against a cachedState of {loading: true} — and a navigation race can
      // cause it to miss the eventual listener notification, leaving the
      // spinner stuck until the next refresh.
      const fgUser = await getUserById(cred.user.uid);
      setCachedState({
        firebaseUser: cred.user,
        fgUser,
        loading: false,
        error: null,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sign-in failed";
      setCachedState({ ...cachedState, loading: false, error: msg });
      throw err;
    }
  }

  async function logOut() {
    await signOut(auth);
    // onAuthStateChanged clears cachedState to signed-out.
  }

  return { ...state, signIn, logOut };
}
