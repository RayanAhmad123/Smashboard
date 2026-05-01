import Link from "next/link";
import { ReactNode } from "react";

type Variant = "primary" | "secondary" | "primaryDark" | "secondaryDark";

const variants: Record<Variant, string> = {
  primary:
    "bg-emerald-600 text-white shadow-sm hover:bg-emerald-500 focus-visible:outline-emerald-600",
  secondary:
    "border border-zinc-300 bg-white text-zinc-900 hover:border-zinc-400 focus-visible:outline-zinc-400",
  primaryDark:
    "bg-[#9fc843] text-slate-950 shadow-sm hover:bg-[#b3da5d] focus-visible:outline-[#9fc843]",
  secondaryDark:
    "border border-white/30 bg-white/5 text-white hover:bg-white/10 focus-visible:outline-white/60",
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2";

type Props = {
  variant?: Variant;
  href: string;
  children: ReactNode;
  className?: string;
};

export function Button({
  variant = "primary",
  href,
  children,
  className = "",
}: Props) {
  const cls = `${base} ${variants[variant]} ${className}`;
  const isExternal =
    href.startsWith("http") ||
    href.startsWith("mailto:") ||
    href.startsWith("#");
  if (isExternal) {
    return (
      <a href={href} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}
