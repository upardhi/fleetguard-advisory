import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../_lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg" | "xl";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  full?: boolean;
  asChild?: boolean;
};

const variants: Record<Variant, string> = {
  primary: "bg-brand-800 text-white hover:bg-brand-700 shadow-sm ring-1 ring-brand-900/10",
  secondary: "bg-white text-slate-800 hover:bg-slate-50 border border-slate-300 shadow-xs",
  ghost: "bg-transparent text-slate-700 hover:bg-slate-100",
  danger: "bg-danger-600 text-white hover:bg-danger-700 shadow-sm",
  success: "bg-success-600 text-white hover:bg-success-700 shadow-sm",
};

const sizes: Record<Size, string> = {
  sm: "h-8  px-3  text-[13px] gap-1.5 rounded-md",
  md: "h-10 px-4  text-sm     gap-2   rounded-lg",
  lg: "h-12 px-5  text-[15px] gap-2   rounded-lg",
  xl: "h-14 px-6  text-base   gap-2.5 rounded-xl",
};

export function Button({
  variant = "primary",
  size = "md",
  leftIcon,
  rightIcon,
  full,
  className,
  children,
  ...rest
}: Props) {
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center font-semibold tracking-tight transition-all",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        full && "w-full",
        className
      )}
      {...rest}
    >
      {leftIcon}
      {children}
      {rightIcon}
    </button>
  );
}
