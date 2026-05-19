"use client";

import { useEffect, useState } from "react";
import { Avatar } from "./Avatar";
import { cx } from "../_lib/utils";

type Size = "sm" | "md" | "lg";

/**
 * Displays a driver's face photo with a bullet-proof fallback.
 *
 * If the URL is missing OR the request 404s/times-out (common with vendor CDN
 * URLs that expire before we've rehosted them), we render the Avatar initials
 * bubble instead of the browser's default broken-image icon.
 */
export function DriverFaceImage({
  src,
  name,
  size = "sm",
  className,
}: {
  src: string | null | undefined;
  name: string;
  size?: Size;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);

  // Reset the broken state if the src actually changes (e.g. the driver
  // detail panel reopens on a different driver).
  useEffect(() => {
    setBroken(false);
  }, [src]);

  if (!src || broken) {
    return <Avatar name={name} size={size} className={className} />;
  }

  const dim =
    size === "sm"
      ? "h-10 w-10"
      : size === "md"
        ? "h-12 w-12"
        : "h-16 w-16";
  const ringed =
    size === "lg" ? "ring-2 ring-slate-200 rounded-xl" : "ring-2 ring-slate-100 rounded-full";

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      onError={() => setBroken(true)}
      className={cx(dim, "shrink-0 object-cover", ringed, className)}
    />
  );
}
