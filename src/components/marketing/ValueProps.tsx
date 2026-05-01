import { Container } from "./Container";
import { Section } from "./Section";

const items = [
  {
    title: "Ser proffsigt ut på TV:n",
    body: "Stora siffror, tydliga banor, live-uppdateringar. Spelarna tar turneringen på allvar när skärmen gör det.",
    icon: (
      <svg viewBox="0 0 32 32" className="h-6 w-6" aria-hidden>
        <rect
          x="3"
          y="6"
          width="26"
          height="17"
          rx="2"
          stroke="currentColor"
          strokeWidth="1.6"
          fill="none"
        />
        <path
          d="M11 27h10M16 23v4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M8 12l3 3 4-5 5 6 4-3"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    ),
  },
  {
    title: "Personalen kör igång på 5 minuter",
    body: "Lägg till spelare, välj format, klicka starta. Inga manualer, ingen utbildningskväll, ingen kalkylhjälp i kassan.",
    icon: (
      <svg viewBox="0 0 32 32" className="h-6 w-6" aria-hidden>
        <circle
          cx="16"
          cy="16"
          r="11"
          stroke="currentColor"
          strokeWidth="1.6"
          fill="none"
        />
        <path
          d="M16 9v7l4.5 2.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    ),
  },
  {
    title: "Tre format ut ur lådan",
    body: "Mexicano, Americano och Lag-Mexicano. Samma verktyg, oavsett om kvällen är social, tävling eller parlek.",
    icon: (
      <svg viewBox="0 0 32 32" className="h-6 w-6" aria-hidden>
        <path
          d="M10 5h12l-1 6c0 3-2.5 5.5-5 5.5S11 14 11 11l-1-6z"
          stroke="currentColor"
          strokeWidth="1.6"
          fill="none"
          strokeLinejoin="round"
        />
        <path
          d="M16 16.5V22M11 27h10M5 7h5M22 7h5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

export function ValueProps() {
  return (
    <Section id="funktioner" tone="light">
      <Container>
        <div className="max-w-2xl">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.22em] text-emerald-600">
            Byggd för hallar
          </p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-zinc-900 md:text-5xl">
            Inte ett spelregister. Ett verktyg för dig som driver kvällen.
          </h2>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {items.map((item) => (
            <div
              key={item.title}
              className="group relative rounded-2xl border border-zinc-200 bg-white p-7 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
            >
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                {item.icon}
              </div>
              <h3 className="mt-5 text-xl font-semibold text-zinc-900">
                {item.title}
              </h3>
              <p className="mt-2 text-base leading-relaxed text-zinc-600">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </Section>
  );
}
