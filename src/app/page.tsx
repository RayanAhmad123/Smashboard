import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0f0f0f] px-6 text-center">
      <h1 className="text-5xl font-semibold tracking-tight text-white sm:text-6xl">
        Smashboard
      </h1>
      <p className="mt-4 text-lg text-zinc-400">
        Padel tournament management
      </p>
      <Link
        href="/demo/tournament/new"
        className="mt-10 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition-colors hover:bg-zinc-200"
      >
        Open demo <span aria-hidden>→</span>
      </Link>
    </div>
  );
}
