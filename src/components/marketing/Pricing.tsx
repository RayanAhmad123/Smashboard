import { Container } from "./Container";
import { Section } from "./Section";

type Tier = {
  name: string;
  price: string;
  period?: string;
  tagline: string;
  description: string;
  features: string[];
  cta: { label: string; href: string };
  highlighted?: boolean;
};

const tiers: Tier[] = [
  {
    name: "Start",
    price: "499 kr",
    period: "per månad",
    tagline: "För mindre hallar",
    description: "Perfekt för en enskild hall som kör turneringar då och då.",
    features: [
      "Upp till 4 banor per turnering",
      "Mexicano, Americano & Lag-Mexicano",
      "Live TV-display via HDMI",
      "Egen subdomän",
      "E-postsupport",
    ],
    cta: { label: "Boka demo", href: "#kontakt" },
  },
  {
    name: "Hall",
    price: "999 kr",
    period: "per månad",
    tagline: "Mest populär",
    description:
      "För padelhallar med regelbundna turneringar och full white-label.",
    features: [
      "Obegränsat antal banor",
      "Alla format & slutspel (A/B/C)",
      "Full white-label: logga, färg, subdomän",
      "Spelarregister & historik",
      "Prioriterad support",
    ],
    cta: { label: "Boka demo", href: "#kontakt" },
    highlighted: true,
  },
  {
    name: "Kedja",
    price: "Anpassat",
    tagline: "För kedjor & arrangörer",
    description:
      "Flera hallar, dedikerad support och avtal som passar er organisation.",
    features: [
      "Flera hallar under samma avtal",
      "Konsoliderad statistik & export",
      "SLA & dedikerad kontaktperson",
      "Onboarding på plats",
      "Anpassade integrationer",
    ],
    cta: { label: "Kontakta säljare", href: "#kontakt" },
  },
];

const checkIcon = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden
    className="mt-0.5 flex-shrink-0"
  >
    <path
      d="M3 8l3.5 3.5L13 5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export function Pricing() {
  return (
    <Section id="priser" tone="tinted">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.22em] text-emerald-600">
            Priser
          </p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-zinc-900 md:text-5xl">
            Enkel prissättning. Inga överraskningar.
          </h2>
          <p className="mt-5 text-lg text-zinc-600">
            En fast månadskostnad per hall. Ingen bindningstid, ingen
            startavgift, white-label ingår från start.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {tiers.map((tier) => (
            <article
              key={tier.name}
              className={`relative flex flex-col rounded-2xl border p-7 transition ${
                tier.highlighted
                  ? "border-emerald-500 bg-white shadow-lg ring-1 ring-emerald-500/20"
                  : "border-zinc-200 bg-white hover:-translate-y-0.5 hover:shadow-md"
              }`}
            >
              {tier.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#9fc843] px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-950">
                  {tier.tagline}
                </span>
              )}
              {!tier.highlighted && (
                <span className="inline-flex w-fit rounded-full bg-zinc-100 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-700">
                  {tier.tagline}
                </span>
              )}

              <h3 className="mt-5 text-2xl font-bold text-zinc-900">
                {tier.name}
              </h3>

              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-4xl font-bold tracking-tight text-zinc-900">
                  {tier.price}
                </span>
                {tier.period && (
                  <span className="text-sm text-zinc-500">{tier.period}</span>
                )}
              </div>

              <p className="mt-3 text-sm leading-relaxed text-zinc-600">
                {tier.description}
              </p>

              <ul className="mt-6 flex-1 space-y-3 text-sm text-zinc-700">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5">
                    <span className="text-emerald-600">{checkIcon}</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <a
                href={tier.cta.href}
                className={`mt-8 inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition ${
                  tier.highlighted
                    ? "bg-emerald-600 text-white hover:bg-emerald-500"
                    : "border border-zinc-300 bg-white text-zinc-900 hover:border-zinc-400"
                }`}
              >
                {tier.cta.label}
                <span aria-hidden>→</span>
              </a>
            </article>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-zinc-500">
          Alla priser exklusive moms. Faktureras månadsvis. Ingen bindningstid —
          säg upp när du vill.
        </p>
      </Container>
    </Section>
  );
}
