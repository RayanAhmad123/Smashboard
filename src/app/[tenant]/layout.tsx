import Image from "next/image";

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="px-6 py-3 border-b border-zinc-800 bg-black">
        <Image src="/icons/logo.svg" alt="Smashboard" width={160} height={48} priority />
      </header>
      {children}
    </>
  );
}
