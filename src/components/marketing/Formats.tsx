import { Container } from "./Container";
import { Section } from "./Section";

const formats = [
  {
    name: "Mexicano",
    tag: "Bäst för: sociala kvällar",
    body: "Dynamiska par. Varje rond skapas nya lagkonstellationer baserat på poäng. Alla möter alla — i olika kombinationer.",
    accent: "#9fc843",
    diagram: (
      <svg viewBox="0 0 200 80" className="h-20 w-full" aria-hidden>
        <defs>
          <marker
            id="arrow-1"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="#9fc843" />
          </marker>
        </defs>
        {[20, 70, 120, 170].map((x, i) => (
          <g key={x}>
            <circle cx={x} cy="22" r="9" fill="#9fc843" opacity={0.85} />
            <text
              x={x}
              y="26"
              textAnchor="middle"
              fontSize="11"
              fontWeight="700"
              fill="#0a0a0a"
              fontFamily="monospace"
            >
              {String.fromCharCode(65 + i)}
            </text>
            <circle cx={x} cy="58" r="9" fill="#10b981" opacity={0.85} />
            <text
              x={x}
              y="62"
              textAnchor="middle"
              fontSize="11"
              fontWeight="700"
              fill="white"
              fontFamily="monospace"
            >
              {String.fromCharCode(69 + i)}
            </text>
          </g>
        ))}
        <path
          d="M30 30 Q 50 45 60 50"
          stroke="#9fc843"
          strokeWidth="1.4"
          fill="none"
          strokeDasharray="3 3"
          markerEnd="url(#arrow-1)"
        />
        <path
          d="M80 30 Q 100 45 110 50"
          stroke="#9fc843"
          strokeWidth="1.4"
          fill="none"
          strokeDasharray="3 3"
          markerEnd="url(#arrow-1)"
        />
        <path
          d="M130 30 Q 150 45 160 50"
          stroke="#9fc843"
          strokeWidth="1.4"
          fill="none"
          strokeDasharray="3 3"
          markerEnd="url(#arrow-1)"
        />
      </svg>
    ),
  },
  {
    name: "Americano",
    tag: "Bäst för: rättvis ranking",
    body: "Full round-robin på individnivå. Alla spelare möter varandra under kvällen. En tydlig vinnare i slutet.",
    accent: "#10b981",
    diagram: (
      <svg viewBox="0 0 200 80" className="h-20 w-full" aria-hidden>
        {[
          [40, 20],
          [160, 20],
          [40, 60],
          [160, 60],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="9" fill="#10b981" opacity={0.85} />
        ))}
        {[
          ["40", "20", "160", "20"],
          ["40", "60", "160", "60"],
          ["40", "20", "40", "60"],
          ["160", "20", "160", "60"],
          ["40", "20", "160", "60"],
          ["160", "20", "40", "60"],
        ].map((p, i) => (
          <line
            key={i}
            x1={p[0]}
            y1={p[1]}
            x2={p[2]}
            y2={p[3]}
            stroke="#10b981"
            strokeWidth="1.2"
            opacity={0.5}
          />
        ))}
      </svg>
    ),
  },
  {
    name: "Lag-Mexicano",
    tag: "Bäst för: partävlingar",
    body: "Fasta par. Ni anmäler er som lag och möter andra par. Banor roterar efter prestation, paren står fast.",
    accent: "#0d9469",
    diagram: (
      <svg viewBox="0 0 200 80" className="h-20 w-full" aria-hidden>
        {[
          { x: 30, y: 40, label: "A1" },
          { x: 70, y: 40, label: "A2" },
          { x: 130, y: 40, label: "B1" },
          { x: 170, y: 40, label: "B2" },
        ].map((p) => (
          <g key={p.label}>
            <circle cx={p.x} cy={p.y} r="11" fill="#0d9469" opacity={0.9} />
            <text
              x={p.x}
              y={p.y + 4}
              textAnchor="middle"
              fontSize="10"
              fontWeight="700"
              fill="white"
              fontFamily="monospace"
            >
              {p.label}
            </text>
          </g>
        ))}
        <path
          d="M50 26 Q 50 18 50 18"
          stroke="#0d9469"
          strokeWidth="1.2"
          opacity={0.4}
        />
        <line
          x1="30"
          y1="55"
          x2="70"
          y2="55"
          stroke="#0d9469"
          strokeWidth="1.4"
        />
        <line
          x1="130"
          y1="55"
          x2="170"
          y2="55"
          stroke="#0d9469"
          strokeWidth="1.4"
        />
        <text
          x="50"
          y="68"
          textAnchor="middle"
          fontSize="9"
          fill="#0d9469"
          fontFamily="monospace"
        >
          PAR A
        </text>
        <text
          x="150"
          y="68"
          textAnchor="middle"
          fontSize="9"
          fill="#0d9469"
          fontFamily="monospace"
        >
          PAR B
        </text>
      </svg>
    ),
  },
];

export function Formats() {
  return (
    <Section id="format" tone="light">
      <Container>
        <div className="max-w-2xl">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.22em] text-emerald-600">
            Tre format
          </p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-zinc-900 md:text-5xl">
            Välj format. Resten sköter sig självt.
          </h2>
          <p className="mt-5 text-lg text-zinc-600">
            Smashboard räknar par, banor och poäng åt dig — oavsett vilket
            format kvällen kräver.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {formats.map((f) => (
            <article
              key={f.name}
              className="relative flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white p-7 transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div
                className="absolute inset-x-0 top-0 h-1"
                style={{ backgroundColor: f.accent }}
                aria-hidden
              />
              <span className="inline-flex w-fit rounded-full bg-zinc-100 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-700">
                {f.tag}
              </span>
              <h3 className="mt-5 text-2xl font-bold text-zinc-900">
                {f.name}
              </h3>
              <p className="mt-3 flex-1 text-base leading-relaxed text-zinc-600">
                {f.body}
              </p>
              <div className="mt-6 rounded-xl bg-zinc-50 p-4">{f.diagram}</div>
            </article>
          ))}
        </div>
      </Container>
    </Section>
  );
}
