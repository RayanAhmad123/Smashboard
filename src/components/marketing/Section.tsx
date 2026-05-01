import { ReactNode } from "react";

type Tone = "light" | "dark" | "tinted";

const toneClasses: Record<Tone, string> = {
  light: "bg-white text-zinc-900",
  dark: "bg-slate-950 text-white",
  tinted: "bg-gradient-to-b from-lime-50/60 to-white text-zinc-900",
};

export function Section({
  id,
  tone = "light",
  children,
  className = "",
}: {
  id?: string;
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`relative py-20 md:py-28 ${toneClasses[tone]} ${className}`}
    >
      {children}
    </section>
  );
}
