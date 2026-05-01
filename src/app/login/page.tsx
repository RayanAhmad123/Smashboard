import { Suspense } from "react";
import Image from "next/image";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="relative min-h-screen flex items-center justify-center bg-slate-950 p-6 overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(ellipse at top, rgba(159,200,67,0.18), transparent 55%), radial-gradient(ellipse at bottom, rgba(16,185,129,0.10), transparent 60%)",
        }}
      />
      <div className="relative w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <Image
            src="/icons/logo.svg"
            alt="Smashboard"
            width={160}
            height={48}
            priority
          />
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur p-8 shadow-2xl shadow-black/40">
          <h1 className="text-2xl font-semibold text-white mb-1">Logga in</h1>
          <p className="text-sm text-zinc-400 mb-6">
            Ange din e-post så mailar vi en inloggningslänk.
          </p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
