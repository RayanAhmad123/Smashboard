import { Container } from "./Container";
import { Section } from "./Section";
import { TVMockup } from "./TVMockup";

export function TVShowcase() {
  return (
    <Section id="tv-display" tone="tinted">
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.22em] text-emerald-600">
            TV-display
          </p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-zinc-900 md:text-5xl">
            Allt händer på storskärmen.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-zinc-600">
            Spelarna ser sin bana, sitt resultat och nästa match utan att fråga.
            Allt uppdateras direkt när du skriver in poängen.
          </p>
        </div>

        <div className="mt-16 flex justify-center">
          <TVMockup size="lg" />
        </div>

        <ul className="mx-auto mt-16 grid max-w-4xl gap-4 sm:grid-cols-3">
          {[
            { label: "Realtid", body: "Poäng dyker upp direkt — ingen reload, ingen fördröjning." },
            { label: "Stora siffror", body: "Designat för att läsas tvärs över hallen, inte över bordet." },
            { label: "Auto-rondering", body: "Nästa rond räknas och visas — du behöver inte räkna par." },
          ].map((f) => (
            <li
              key={f.label}
              className="rounded-xl border border-zinc-200 bg-white/80 p-5 backdrop-blur"
            >
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                {f.label}
              </p>
              <p className="mt-2 text-sm text-zinc-700">{f.body}</p>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}
