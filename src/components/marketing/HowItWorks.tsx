import { Container } from "./Container";
import { Section } from "./Section";

const steps = [
  {
    n: "01",
    title: "Anslut TV:n",
    body: "Plugga in laptopen via HDMI. Öppna display-vyn på storskärmen.",
  },
  {
    n: "02",
    title: "Skriv in resultat",
    body: "Hosten styr allt från laptopen. Klicka in poäng efter varje match.",
  },
  {
    n: "03",
    title: "Live på storskärmen",
    body: "Banor, poäng och nästa rond uppdateras direkt. Spelarna ser allt.",
  },
];

export function HowItWorks() {
  return (
    <Section tone="light" className="border-y border-zinc-100">
      <Container>
        <div className="max-w-2xl">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.22em] text-emerald-600">
            Så funkar det
          </p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-zinc-900 md:text-5xl">
            Tre steg från laptop till storskärm.
          </h2>
        </div>

        <div className="relative mt-14 grid gap-8 md:grid-cols-3 md:gap-6">
          <div
            className="pointer-events-none absolute top-12 left-0 right-0 hidden h-px md:block"
            style={{
              background:
                "linear-gradient(to right, transparent, #d4d4d8 20%, #d4d4d8 80%, transparent)",
            }}
            aria-hidden
          />
          {steps.map((s) => (
            <div key={s.n} className="relative">
              <div className="relative inline-flex h-24 w-24 items-center justify-center rounded-full bg-white ring-1 ring-zinc-200">
                <div className="absolute inset-0 -z-10 rounded-full bg-gradient-to-br from-emerald-50 to-lime-50" />
                <span className="font-mono text-2xl font-bold tracking-tight text-emerald-700">
                  {s.n}
                </span>
              </div>
              <h3 className="mt-6 text-xl font-semibold text-zinc-900">
                {s.title}
              </h3>
              <p className="mt-2 max-w-xs text-base leading-relaxed text-zinc-600">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </Section>
  );
}
