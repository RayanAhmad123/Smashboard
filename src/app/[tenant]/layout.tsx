import Image from "next/image";

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="px-4 sm:px-6 py-3 border-b border-zinc-800 bg-black flex items-center">
        <Image
          src="/icons/logo.svg"
          alt="Smashboard"
          width={120}
          height={36}
          priority
          className="block h-9 w-auto sm:h-12"
        />
      </header>
      {children}
    </>
  );
}
