import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

const WHATS_NEW_KEY = "swmmx.whatsnew.openswmm-2026";

function WhatsNewBanner() {
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    setDismissed(localStorage.getItem(WHATS_NEW_KEY) === "1");
  }, []);
  if (dismissed) return null;
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/5 px-4 py-2.5 text-[13.5px]">
      <div className="flex items-center gap-2 text-foreground/90">
        <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber-300">
          What's new
        </span>
        <span>
          New section:{" "}
          <a href="#openswmm" className="text-amber-300 underline decoration-amber-500/40 underline-offset-2 hover:text-amber-200">
            Where OpenSWMM / SWMM6 stands today
          </a>{" "}
          — why the SXPF gap is bigger than it was six months ago.
        </span>
      </div>
      <button
        onClick={() => { localStorage.setItem(WHATS_NEW_KEY, "1"); setDismissed(true); }}
        className="rounded border border-amber-500/40 bg-transparent px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-amber-300 hover:bg-amber-500/10"
      >
        dismiss
      </button>
    </div>
  );
}


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SWMM-X Architecture Plan" },
      { name: "description", content: "Design vision for SWMM-X: desktop → cloud → AI. Project format, .inp compat, results analytics." },
    ],
  }),
  component: Plan,
});

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="mt-12 mb-3 text-2xl font-semibold tracking-tight scroll-mt-8">{children}</h2>;
}
function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-8 mb-2 text-lg font-semibold tracking-tight">{children}</h3>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="my-3 text-[15px] leading-7 text-foreground/90">{children}</p>;
}
function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px]">{children}</code>;
}
function Pre({ children }: { children: string }) {
  return (
    <pre className="my-4 overflow-x-auto rounded-md border border-border bg-card p-4 font-mono text-[12.5px] leading-6 text-foreground/90">
      {children}
    </pre>
  );
}

function Plan() {
  return (
    <article className="max-w-3xl">
      <WhatsNewBanner />
      <div className="mb-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">Design / 2026 → 2030</div>
      <h1 className="text-4xl font-bold tracking-tight">Reimagining SWMM for 2030</h1>
      <P>
        A senior-architect answer to <em>"design a SWMM that's better for 2030"</em>. The goal is not a faster
        solver — it's a project format, runtime, and developer surface that makes desktop, cloud, and AI a single
        product instead of three bolted together.
      </P>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          ["Format", "SXPF — diffable, queryable, .inp round-trip"],
          ["Runtime", "Same kernel local / cloud / GPU"],
          ["Data", "Zarr cube + Parquet analytics, one writer"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md border border-border bg-card p-4">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{k}</div>
            <div className="mt-1 text-sm">{v}</div>
          </div>
        ))}
      </div>

      <H2 id="thesis">Thesis</H2>
      <P>
        SWMM5 is a monolith with a text format. SWMM6 papered over it. By 2030, every water utility runs continuous
        ensembles against live telemetry and a digital twin — that workload cannot live inside a desktop binary
        with a 1990s flat-file. The right artifact is a versioned project format, an embeddable solver, and a
        cloud-native results layer. The UI (desktop or browser) is a client, not the product.
      </P>

      <H2 id="openswmm">Where OpenSWMM / SWMM6 stands today</H2>
      <P>
        The context shifted in 2025–2026. EPA's Office of Research and Development — the group that housed
        SWMM development — was eliminated by recent administration actions. Caleb Buahin, the engineer who
        had been maintaining SWMM inside EPA, left for Hazen and Sawyer. The official{" "}
        <Code>USEPA/Stormwater-Management-Model</Code> repository still shows{" "}
        <Code>v5.2.4</Code> (August 2023) as its most recent tagged release. There is no v5.3 or v6 from EPA,
        and there is unlikely to be one.
      </P>
      <P>
        The engine work didn't stop — it moved. Buahin is continuing open-source development through his own{" "}
        <Code>HydroCouple</Code> GitHub organization, targeting an unofficial <Code>5.3.0</Code> and then{" "}
        <Code>6.0.0</Code>: multi-platform builds, better routing efficiency, expanded testing, a wider
        Python API, consolidated docs, and real CSV support — deliberately without making QGIS the primary
        GUI so the engine stays free of heavy external dependencies.
      </P>

      <H3>The concrete code state</H3>
      <P>
        Diffed against the <Code>swmm6_rel</Code> branch, the delta is substantial rather than cosmetic:
      </P>
      <div className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["+11,232 / −5,780", "lines across 75 shared files"],
          ["18", "new API headers"],
          ["322", "new C functions"],
          ["1", "new swmm5_stats.c"],
        ].map(([n, l]) => (
          <div key={l} className="rounded-md border border-border bg-card p-3">
            <div className="font-mono text-sm text-foreground">{n}</div>
            <div className="mt-0.5 text-[11.5px] text-muted-foreground">{l}</div>
          </div>
        ))}
      </div>
      <P>
        Two architectural shifts stand out: a reentrant <Code>SWMM_Engine</Code> handle replaces the old
        global-state singleton (a prerequisite for embedding the solver as a library rather than a CLI),
        and the internal data model is moving toward a Structure-of-Arrays layout (a prerequisite for
        vectorization and, eventually, GPU offload).
      </P>

      <H3>Packaging is still pre-release</H3>
      <P>
        <Code>openswmm</Code> sits at <Code>5.3.0.dev1</Code> on PyPI; <Code>epaswmm</Code> is described as
        awaiting EPA's own QA clearance and is still alpha. Nothing here is production-ready, and no one
        should ship a utility digital twin against it yet.
      </P>

      <H3>Not to conflate</H3>
      <ul className="my-3 list-disc space-y-1 pl-6 text-[15px] leading-7 text-foreground/90">
        <li>
          <strong>SWMM5+</strong> (Ben Hodges / CIMM) is a separate research effort — not OpenSWMM.
        </li>
        <li>
          <strong>OWA's <Code>pyswmm</Code> and <Code>swmm-toolkit</Code></strong> run on the frozen
          5.2.4 engine and are not part of the 5.3/6.0 line.
        </li>
        <li>
          <strong>CHI's "OpenSWMM"</strong> — a public-domain fork shipped in 2017 — reuses the name but is
          unrelated.
        </li>
        <li>
          <strong>"SWMM6"</strong> is not, and has never been, an EPA designation.
        </li>
      </ul>

      <div className="my-6 rounded-md border-l-2 border-accent bg-accent/5 py-2 pl-4 pr-3 text-[15px] leading-7 text-foreground/90">
        <strong>Bridge back to the thesis:</strong> the 6.0.0-alpha work is rewriting the engine's{" "}
        <em>internals</em> and <em>packaging</em> — reentrancy, SoA layout, Python API, CSV I/O. It is not
        rewriting the project format or the single-machine execution model. Those are exactly the gaps
        SXPF, a shared runtime, and a typed AI surface are aimed at. The community engine is finally
        modernizing; the format around it still isn't.
      </div>

      <H2 id="pillars">Three architectural pillars</H2>

      <H3>1. SXPF — the project format</H3>
      <P>
        A directory, not a file. Typed Parquet/GeoParquet for topology, YAML for scenarios and control rules,
        explicit <Code>schema_version</Code> on every artifact, and a content-addressed <Code>run.json</Code> for
        every simulation. Diffable in git. Queryable with DuckDB. Round-trippable with EPA-SWMM5 <Code>.inp</Code>.
      </P>
      <Pre>{`project.sxpf/
├── manifest.yaml           # project, units, solver pin
├── topology/
│   ├── nodes.parquet       # GeoParquet, dict-encoded ids
│   ├── links.parquet
│   ├── subcatchments.parquet
│   ├── curves/, patterns/, lid/
│   └── controls/*.rule.yaml  # typed AST + original_text
├── forcings/               # rainfall, evap, inflows, DWF
├── scenarios/*.scenario.yaml
├── ensembles/*.ensemble.yaml
└── runs/<sha256>/
    ├── run.json            # content-addressed
    ├── results.zarr/       # the numerics cube
    └── parquet/            # analytics surface (same data)`}</Pre>

      <H3>2. One solver, three runtimes</H3>
      <P>
        Solver is a Rust core compiled to (a) a desktop library, (b) a Linux daemon for cloud, (c) WASM for
        in-browser previews. Same kernel, same bit-equivalent results, selected at call time. The desktop app
        becomes a thin client that can offload to cloud without a different code path.
      </P>

      <H3>3. AI as a typed surface, not a chatbot</H3>
      <P>
        Models call SXPF through typed tools: <Code>propose_override(scenario, where, set)</Code>,
        <Code>run(scenario_id)</Code>, <Code>explain(run_id, element_id)</Code>. The AI never edits raw text;
        it produces declarative overrides that diff cleanly and can be reviewed, approved, and rolled back.
        That makes "AI calibrated my model" auditable.
      </P>

      <H2 id="deliverables">Concrete deliverables</H2>
      <P>Three specs already drafted — open them for the full detail:</P>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link to="/mapping" className="block rounded-md border border-border bg-card p-4 transition-colors hover:border-foreground/30">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Spec 1</div>
          <div className="mt-1 font-medium">.inp ↔ SWMM-X mapping</div>
          <div className="mt-1 text-xs text-muted-foreground">Section-by-section bridge, round-trip contract, conformance harness.</div>
        </Link>
        <Link to="/schemas" className="block rounded-md border border-border bg-card p-4 transition-colors hover:border-foreground/30">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Spec 2 + 3</div>
          <div className="mt-1 font-medium">JSON Schema + Parquet layout</div>
          <div className="mt-1 text-xs text-muted-foreground">SXPF v1 schemas and results partitioning for SQL analytics.</div>
        </Link>
      </div>

      <H2 id="non-goals">Explicit non-goals</H2>
      <ul className="my-3 list-disc space-y-1 pl-6 text-[15px] leading-7 text-foreground/90">
        <li>Not a new solver algorithm. SWMM's St. Venant kernel stays; we wrap it.</li>
        <li>Not a new UI framework. Desktop ships with the existing client, talking SXPF.</li>
        <li>Not "AI generates models from prompts" — AI proposes overrides on existing models.</li>
      </ul>

      <H2 id="open">Open calls</H2>
      <P>Decisions that need a human before the v1.0 freeze:</P>
      <ol className="my-3 list-decimal space-y-1 pl-6 text-[15px] leading-7 text-foreground/90">
        <li>Water quality in v1.0 or v1.1?</li>
        <li>float32 vs float64 in long-format timeseries.</li>
        <li><Code>sample_id</Code> as partition vs column for large ensembles.</li>
        <li>Control-rule AST: replace <Code>.inp</Code> text or keep both.</li>
      </ol>
    </article>
  );
}
