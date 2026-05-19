// components/LoadingOverlay.tsx
"use client";

import { ReactNode } from "react";

interface LoadingOverlayProps {
  isLoading: boolean;
  message?: string;
  children?: ReactNode;
  position?: "top" | "overlay";
}

export function LoadingOverlay({ 
  isLoading, 
  message = "Loading…", 
  children,
  position = "top" 
}: LoadingOverlayProps) {
  if (!isLoading) return children || null;

  if (position === "overlay") {
    return (
      <div className="relative">
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-white/50 backdrop-blur-sm">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3.5 py-1.5 text-[12px] font-semibold text-slate-700 shadow-md backdrop-blur">
            <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
            {message}
          </div>
        </div>
        {children}
      </div>
    );
  }

  // position === "top" (default) - floating pill at top
  return (
    <>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex items-center justify-center px-8 pt-4">
        <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3.5 py-1.5 text-[12px] font-semibold text-slate-700 shadow-md backdrop-blur">
          <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
          {message}
        </div>
      </div>
    </>
  );
}

// Simple centered spinner for inline loading
export function LoadingSpinner({ 
  size = "md", 
  message 
}: { 
  size?: "sm" | "md" | "lg";
  message?: string;
}) {
  const sizeClasses = {
    sm: "h-3 w-3",
    md: "h-5 w-5",
    lg: "h-8 w-8",
  };

  return (
    <div className="flex items-center justify-center gap-2 py-4">
      <div className={`${sizeClasses[size]} animate-spin rounded-full border-2 border-brand-500 border-t-transparent`} />
      {message && <span className="text-[13px] text-slate-500">{message}</span>}
    </div>
  );
}

// Full-page loading screen
export function FullPageLoader({ message = "Loading dashboard…" }: { message?: string }) {
  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="inline-flex items-center gap-2 text-[13px] text-slate-500">
        <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
        {message}
      </div>
    </div>
  );
}