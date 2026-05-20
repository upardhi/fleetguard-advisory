import { cx } from "../_lib/utils";

type Props = {
  size?: number;
  variant?: "light" | "dark";
  className?: string;
};

/**
 * FleetGuard brand mark — a stylised gate shield.
 * Uses only inline SVG so no runtime dependency.
 */
export function Logo({ size = 50, variant = "dark", className }: Props) {
  const logoSrc = variant === "light" 
    ? "/fleetadvisory-logo-white.png" 
    : "/fleetadvisory-logo-dark.png"; 

  return (
    <div className={cx("flex items-center gap-3", className)}>
      <div className="leading-tight">
        <img 
          src={logoSrc} 
          alt="FleetGuard logo" 
          className="h-auto w-auto"
          style={{ maxHeight: `${size}px`, width: 'auto' }}
        />
      </div>
    </div>
  );
}