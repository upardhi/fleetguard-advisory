import { avatarHue, initials, cx } from "../_lib/utils";

type Size = "xs" | "sm" | "md" | "lg";

const sizes: Record<Size, string> = {
  xs: "h-6  w-6  text-[10px]",
  sm: "h-8  w-8  text-[11px]",
  md: "h-10 w-10 text-[13px]",
  lg: "h-14 w-14 text-base",
};

export function Avatar({
  name,
  size = "md",
  tone,
  className,
}: {
  name: string | null | undefined;
  size?: Size;
  tone?: "brand" | "slate" | "auto";
  className?: string;
}) {
  const safeName = name ?? "?";
  const hue = avatarHue(safeName);
  const bg = tone === "brand" ? "#214f92" : tone === "slate" ? "#334155" : `hsl(${hue}deg 55% 32%)`;

  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        sizes[size],
        className
      )}
      style={{ background: bg }}
      aria-hidden
    >
      {initials(safeName)}
    </span>
  );
}
