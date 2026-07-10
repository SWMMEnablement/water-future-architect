import { useEffect, useState } from "react";

// Shared "Where OpenSWMM / SWMM6 stands today" context section.
// Rendered on the architecture, mapping, schemas, and diff pages so the
// context travels with any subpage a reader lands on directly.

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px]">{children}</code>;
}

type Source = {
  id: string;
  label: string;
  url: string;
  note?: string;
};

export const OPENSWMM_SOURCES: Source[] = [
  {
    id: "epa-ord",
    label: "EPA ORD elimination — E&E News / Reuters coverage, 2025",
    url: "https://www.reuters.com/business/environment/trump-administration-fires-hundreds-epa-scientists-2025-07-18/",
    note: "Reporting on the RIF of EPA's Office of Research and Development staff.",
  },
  {
    id: "usepa-repo",
    label: "USEPA/Stormwater-Management-Model — v5.2.4 release (Aug 2023)",
    url: "https://github.com/USEPA/Stormwater-Management-Model/releases/tag/v5.2.4",
    note: "Most recent tagged release on the official EPA repository.",
  },
  {
    id: "hydrocouple",
    label: "HydroCouple GitHub organization",
    url: "https://github.com/hydrocouple",
    note: "Caleb Buahin's org hosting the unofficial 5.3 / 6.0 line of SWMM.",
  },
  {
    id: "swmm6-rel",
    label: "HydroCouple/Stormwater-Management-Model — swmm6_rel branch",
    url: "https://github.com/hydrocouple/Stormwater-Management-Model/tree/swmm6_rel",
    note: "Source of the +11,232 / −5,780 line diff, SWMM_Engine handle, and swmm5_stats.c.",
  },
  {
    id: "openswmm-pypi",
    label: "openswmm 5.3.0.dev1 on PyPI",
    url: "https://pypi.org/project/openswmm/",
  },
  {
    id: "epaswmm-pypi",
    label: "epaswmm on PyPI (alpha, awaiting EPA QA)",
    url: "https://pypi.org/project/epaswmm/",
  },
  {
    id: "pyswmm",
    label: "OWA pyswmm — runs on frozen 5.2.4",
    url: "https://github.com/OpenWaterAnalytics/pyswmm",
  },
  {
    id: "swmm5plus",
    label: "SWMM5+ (Ben Hodges / CIMM) — separate research effort",
    url: "https://github.com/UT-CIWQS/SWMM5plus",
  },
  {
    id: "chi-openswmm",
    label: "CHI OpenSWMM (2017 public-domain fork)",
    url: "https://www.openswmm.org/",
  },
];

function Fn({ n, id }: { n: number; id: string }) {
  return (
    <a
      href={`#fn-${id}`}
      id={`fnref-${id}`}
      className="ml-0.5 rounded bg-accent/50 px-1 py-0.5 align-super font-mono text-[9.5px] text-accent-foreground/80 no-underline hover:bg-accent"
    >
      {n}
    </a>
  );
}

export function OpenSwmmContext({ compact = false }: { compact?: boolean }) {
  return (
    <section id="openswmm" className={compact ? "mt-10" : "mt-12"}>
      <div className="mb-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        Context · shared across subpages
      </div>
      <h2 className="mb-3 text-2xl font-semibold tracking-tight scroll-mt-8">
        Where OpenSWMM / SWMM6 stands today
      </h2>

      {!compact && (
        <div className="mt-4 mb-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-border bg-card p-4">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Official</div>
            <div className="mt-1 font-semibold">v5.2.4</div>
            <div className="mt-1 text-xs text-muted-foreground">Aug 2023 — frozen since EPA ORD was eliminated</div>
          </div>
          <div className="rounded-md border border-border bg-card p-4">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Unofficial roadmap</div>
            <div className="mt-1 font-semibold">5.3.0 → 6.0.0</div>
            <div className="mt-1 text-xs text-muted-foreground">Posted Aug 2025 by Caleb Buahin via HydroCouple</div>
          </div>
          <div className="rounded-md border border-border bg-card p-4">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Current branch</div>
            <div className="mt-1 font-mono text-sm font-semibold">swmm6_rel</div>
            <div className="mt-1 text-xs text-muted-foreground">v6.0.0-alpha.1 · HydroCouple/openswmm.engine</div>
          </div>
        </div>
      )}

      <p className="my-3 text-[15px] leading-7 text-foreground/90">
        EPA's Office of Research and Development — the group that housed SWMM development — was
        eliminated in 2025<Fn n={1} id="epa-ord" />. Caleb Buahin, the engineer maintaining SWMM
        inside EPA, left for Hazen and Sawyer. The official{" "}
        <Code>USEPA/Stormwater-Management-Model</Code> repository still shows <Code>v5.2.4</Code>{" "}
        (August 2023) as its most recent tagged release<Fn n={2} id="usepa-repo" />. There is no
        v5.3 or v6 from EPA, and there is unlikely to be one.
      </p>
      <p className="my-3 text-[15px] leading-7 text-foreground/90">
        The engine work moved. Buahin is continuing open-source development through the{" "}
        <Code>HydroCouple</Code> GitHub organization<Fn n={3} id="hydrocouple" />, targeting an
        unofficial <Code>5.3.0</Code> and then <Code>6.0.0</Code>: multi-platform builds, better
        routing efficiency, a wider Python API, CSV support, and — deliberately — no QGIS as the
        primary GUI, keeping the engine free of heavy external dependencies.
      </p>


      {!compact && (
        <>
          <h3 className="mt-8 mb-2 text-lg font-semibold tracking-tight">The concrete code state</h3>
          <p className="my-3 text-[15px] leading-7 text-foreground/90">
            Diffed against the <Code>swmm6_rel</Code> branch<Fn n={4} id="swmm6-rel" />, the delta
            is substantial: +11,232 / −5,780 lines across 75 shared files, 18 new API headers, 322
            new C functions, a new <Code>swmm5_stats.c</Code>. A reentrant <Code>SWMM_Engine</Code>{" "}
            handle replaces the old global-state singleton, and the internal data model is moving
            toward a Structure-of-Arrays layout.
          </p>

          <h3 className="mt-8 mb-2 text-lg font-semibold tracking-tight">Packaging is pre-release</h3>
          <p className="my-3 text-[15px] leading-7 text-foreground/90">
            <Code>openswmm</Code> sits at <Code>5.3.0.dev1</Code> on PyPI
            <Fn n={5} id="openswmm-pypi" />; <Code>epaswmm</Code> is still alpha, awaiting EPA's
            own QA clearance<Fn n={6} id="epaswmm-pypi" />.
          </p>

          <h3 className="mt-8 mb-2 text-lg font-semibold tracking-tight">Not to conflate</h3>
          <ul className="my-3 list-disc space-y-1 pl-6 text-[15px] leading-7 text-foreground/90">
            <li>
              <strong>SWMM5+</strong> (Ben Hodges / CIMM) is a separate research effort — not
              OpenSWMM<Fn n={7} id="swmm5plus" />.
            </li>
            <li>
              <strong>OWA's <Code>pyswmm</Code></strong> runs on the frozen 5.2.4 engine and is
              not part of the 5.3/6.0 line<Fn n={8} id="pyswmm" />.
            </li>
            <li>
              <strong>CHI's "OpenSWMM"</strong> — a public-domain fork shipped in 2017 — reuses
              the name but is unrelated<Fn n={9} id="chi-openswmm" />.
            </li>
            <li>
              <strong>"SWMM6"</strong> is not, and has never been, an EPA designation.
            </li>
          </ul>
        </>
      )}

      <div className="my-6 rounded-md border-l-2 border-accent bg-accent/5 py-2 pl-4 pr-3 text-[14.5px] leading-7 text-foreground/90">
        <strong>Bridge:</strong> the 6.0.0-alpha work rewrites the engine's <em>internals</em> and{" "}
        <em>packaging</em> — reentrancy, SoA layout, Python API, CSV I/O. It does not rewrite the
        project format or single-machine execution model. Those are the gaps SXPF, a shared
        runtime, and a typed AI surface target.
      </div>

      <div className="mt-6 rounded-md border border-border bg-card p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Sources
          </div>
          <div className="text-[11px] italic text-muted-foreground">
            Fast-moving area — worth reverifying before citing externally.
          </div>
        </div>
        <ol className="space-y-1.5 text-[13px] leading-6">
          {OPENSWMM_SOURCES.map((s, i) => (
            <li key={s.id} id={`fn-${s.id}`} className="flex gap-2">
              <span className="w-6 shrink-0 text-right font-mono text-muted-foreground">{i + 1}.</span>
              <span className="text-foreground/90">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent-foreground underline decoration-accent/50 underline-offset-2 hover:decoration-accent"
                >
                  {s.label}
                </a>
                {s.note ? <span className="text-muted-foreground"> — {s.note}</span> : null}
                <a
                  href={`#fnref-${s.id}`}
                  className="ml-1.5 font-mono text-[11px] text-muted-foreground hover:text-foreground"
                  aria-label="Back to reference"
                >
                  ↩
                </a>
              </span>
            </li>
          ))}
        </ol>
      </div>

    </section>
  );
}

// -----------------------------------------------------------------------------
// Guided tour modal — dismissible, persisted in localStorage.
// -----------------------------------------------------------------------------

const TOUR_KEY = "swmmx.tour.openswmm-2026.v1";

type Step = { title: string; body: React.ReactNode; anchor?: string };

const STEPS: Step[] = [
  {
    title: "Welcome to the SWMM-X plan",
    body: (
      <>
        This is a design RFC, not a shipped product. Four pages: this{" "}
        <strong>architecture</strong> plan, an <strong>.inp ↔ SXPF mapping</strong>, a{" "}
        <strong>schema viewer</strong>, and a <strong>mapping diff</strong> tool. The tour walks
        the highlights in about 30 seconds.
      </>
    ),
  },
  {
    title: "The thesis",
    body: (
      <>
        SWMM5 is a monolith with a 1990s flat-file. The right 2030 artifact is a versioned{" "}
        <strong>project format (SXPF)</strong>, an embeddable solver, and a cloud-native results
        layer. Desktop / cloud / AI become one product.
      </>
    ),
    anchor: "thesis",
  },
  {
    title: "Where OpenSWMM / SWMM6 actually stands",
    body: (
      <>
        EPA ORD was eliminated in 2025 and the official repo is frozen at v5.2.4. Buahin's
        unofficial 5.3/6.0 line lives in the HydroCouple org. Full footnoted context is in the
        next section — this is what makes the SXPF gap bigger than it was six months ago.
      </>
    ),
    anchor: "openswmm",
  },
  {
    title: "Three pillars",
    body: (
      <>
        <strong>1. SXPF</strong> — diffable directory format, .inp round-trip.{" "}
        <strong>2. One solver, three runtimes</strong> — same kernel local / cloud / WASM.{" "}
        <strong>3. AI as a typed surface</strong> — declarative overrides, not chat.
      </>
    ),
    anchor: "pillars",
  },
  {
    title: "Where to go next",
    body: (
      <>
        The <strong>Mapping</strong> and <strong>Schemas</strong> pages hold the concrete specs;
        the <strong>Diff</strong> page validates provenance on real exports (including water
        quality). Each subpage now carries the OpenSWMM context so you can land on any of them
        cold.
      </>
    ),
  },
];

export function GuidedTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [seen, setSeen] = useState(true);

  useEffect(() => {
    const done = localStorage.getItem(TOUR_KEY) === "1";
    setSeen(done);
    if (!done) setOpen(true);
  }, []);

  function close(markSeen: boolean) {
    if (markSeen) {
      localStorage.setItem(TOUR_KEY, "1");
      setSeen(true);
    }
    setOpen(false);
    setStep(0);
  }

  function jump(anchor?: string) {
    close(true);
    if (anchor) {
      setTimeout(() => {
        document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
  }

  return (
    <>
      {seen && !open && (
        <button
          onClick={() => { setStep(0); setOpen(true); }}
          className="mb-4 rounded border border-border bg-card px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          Replay tour
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => close(true)}
        >
          <div
            className="relative w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Guided tour · {step + 1} / {STEPS.length}
              </div>
              <button
                onClick={() => close(true)}
                aria-label="Dismiss tour"
                className="rounded border border-border bg-transparent px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
              >
                skip
              </button>
            </div>
            <h2 id="tour-title" className="mb-2 text-lg font-semibold tracking-tight">
              {STEPS[step].title}
            </h2>
            <div className="text-[14px] leading-6 text-foreground/90">{STEPS[step].body}</div>

            <div className="mt-5 flex items-center justify-between gap-2">
              <div className="flex gap-1">
                {STEPS.map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 w-6 rounded ${i === step ? "bg-accent-foreground/80" : "bg-border"}`}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  disabled={step === 0}
                  className="rounded border border-border px-3 py-1 text-[13px] disabled:opacity-40"
                >
                  Back
                </button>
                {step < STEPS.length - 1 ? (
                  <>
                    {STEPS[step].anchor && (
                      <button
                        onClick={() => jump(STEPS[step].anchor)}
                        className="rounded border border-border px-3 py-1 text-[13px] text-muted-foreground hover:text-foreground"
                      >
                        Jump to section
                      </button>
                    )}
                    <button
                      onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                      className="rounded bg-accent px-3 py-1 text-[13px] text-accent-foreground hover:bg-accent/80"
                    >
                      Next
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => close(true)}
                    className="rounded bg-accent px-3 py-1 text-[13px] text-accent-foreground hover:bg-accent/80"
                  >
                    Done
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
