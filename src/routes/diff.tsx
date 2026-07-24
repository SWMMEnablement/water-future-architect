// ---------------------------------------------------------------------------
// Artifact: SXPF mapping diff / provenance validator
//   Engine   · TanStack Start route + in-browser CSV export
//   Concept  · Validate .inp ↔ SXPF provenance on real exports, incl. water quality; expose failing rows
//   Reusable · "Failing-rows-only" CSV export toggle pattern
//              Section-scoped provenance check registry (extend by dropping in a new checker)
// ---------------------------------------------------------------------------
import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { OpenSwmmContext } from "@/components/openswmm-context";
import { Switch } from "@/components/ui/switch";
import {
  KIND_COLOR,
  RT_COLOR,
  MAPPING,
  SWMMX_SCHEMA_VERSION,
  MAPPING_SPEC_REVISION,
  TOOL_NAME,
  TOOL_VERSION,
  TOOL_COMMIT,
  TOOL_BUILD_DATE,
  WATER_QUALITY_SECTIONS,
  type MappingRow,
} from "../lib/inp-mapping";

const WQ_SET = new Set<string>(WATER_QUALITY_SECTIONS as readonly string[]);
const isWQSection = (s: string) => WQ_SET.has(s);

export const Route = createFileRoute("/diff")({
  head: () => ({
    meta: [
      { title: "Mapping Diff — SWMM-X Docs" },
      { name: "description", content: "Compare two exported SWMM-X mapping specs and highlight added, removed, and changed mappings." },
    ],
  }),
  component: DiffPage,
});

type Provenance = {
  source_dialect?: string;
  source_dialects?: string[];
  original_inp_section?: string;
  tool?: string;
  tool_version?: string;
  tool_commit?: string;
  tool_build_date?: string;
  spec_revision?: string;
  schema_version?: string;
};
type ExportRow = MappingRow & { dialects?: string[]; provenance?: Provenance };
type ExportFile = {
  metadata?: Record<string, unknown> & {
    swmmx_schema_version?: string;
    mapping_spec_revision?: string;
    provenance?: Record<string, unknown>;
    exported_at?: string;
  };
  rows: ExportRow[];
};

type Side = "a" | "b";

type FieldSpec = { key: string; label: string; reason: string; get: (r: ExportRow) => string };

const FIELD_SPECS: FieldSpec[] = [
  { key: "target", label: "target", reason: "mapping", get: r => String(r.target ?? "") },
  { key: "kind", label: "kind", reason: "mapping", get: r => String(r.kind ?? "") },
  { key: "roundTrip", label: "round-trip", reason: "mapping", get: r => String(r.roundTrip ?? "") },
  { key: "notes", label: "notes", reason: "mapping", get: r => String(r.notes ?? "") },
  { key: "dialects", label: "dialects", reason: "mapping", get: r => (r.dialects ?? ["SWMM5", "SWMM6"]).slice().sort().join("|") },
  { key: "prov.source_dialect", label: "prov · dialect", reason: "provenance:dialect", get: r => String(r.provenance?.source_dialect ?? "") },
  { key: "prov.original_inp_section", label: "prov · .inp section", reason: "provenance:inp_section", get: r => String(r.provenance?.original_inp_section ?? "") },
  { key: "prov.tool_version", label: "prov · tool version", reason: "provenance:tool_version", get: r => `${r.provenance?.tool ?? ""}@${r.provenance?.tool_version ?? ""}` },
];

const REASON_LABEL: Record<string, { label: string; color: string }> = {
  "mapping": { label: "mapping", color: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  "provenance:dialect": { label: "prov · dialect", color: "border-sky-500/40 bg-sky-500/10 text-sky-300" },
  "provenance:inp_section": { label: "prov · .inp section", color: "border-violet-500/40 bg-violet-500/10 text-violet-300" },
  "provenance:tool_version": { label: "prov · tool version", color: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300" },
};

// ---------------------------------------------------------------------------
// Breaking-change classifier
//
// A change is "breaking" if a downstream consumer parsing SXPF against the
// A-side spec could silently break under B. Provenance-only shifts (audit
// metadata like tool version, source dialect) are non-breaking.
// ---------------------------------------------------------------------------
type Severity = "breaking" | "non-breaking";
type ChangedField = { field: string; reason: string; a: string; b: string };

const RT_RANK: Record<string, number> = { lossless: 0, semantic: 1, lossy: 2 };

function classifyFieldChange(f: ChangedField): { severity: Severity; why: string } {
  switch (f.field) {
    case "target":
      return { severity: "breaking", why: "target path moved — consumers reading old location will 404" };
    case "kind":
      return { severity: "breaking", why: "row kind changed — schema class of the artifact differs" };
    case "round-trip": {
      const ra = RT_RANK[f.a] ?? 0; const rb = RT_RANK[f.b] ?? 0;
      return rb > ra
        ? { severity: "breaking", why: `round-trip regressed ${f.a} → ${f.b}` }
        : { severity: "non-breaking", why: `round-trip improved ${f.a} → ${f.b}` };
    }
    case "dialects": {
      const A = new Set(f.a ? f.a.split("|") : []);
      const B = new Set(f.b ? f.b.split("|") : []);
      const removed = [...A].filter(d => !B.has(d));
      return removed.length
        ? { severity: "breaking", why: `dialect(s) dropped: ${removed.join(", ")}` }
        : { severity: "non-breaking", why: "dialect coverage widened" };
    }
    case "prov · .inp section":
      return { severity: "breaking", why: "row identity drifted — original .inp section reassigned" };
    case "notes":
      return { severity: "non-breaking", why: "notes copy-edit only" };
    case "prov · dialect":
      return { severity: "non-breaking", why: "audit-only: which dialect was sampled" };
    case "prov · tool version":
      return { severity: "non-breaking", why: "audit-only: exporter build changed" };
    default:
      return { severity: "non-breaking", why: "" };
  }
}

function classifyChanged(fields: ChangedField[]): { severity: Severity; reasons: string[] } {
  const results = fields.map(classifyFieldChange);
  const breaking = results.filter(r => r.severity === "breaking");
  if (breaking.length) return { severity: "breaking", reasons: breaking.map(r => r.why) };
  return { severity: "non-breaking", reasons: results.map(r => r.why).filter(Boolean) };
}



const REQUIRED_PROV_FIELDS = [
  "source_dialect", "original_inp_section",
  "tool", "tool_version", "tool_commit", "tool_build_date",
  "spec_revision", "schema_version",
] as const;

type ProvIssue = { field: string; message: string; wq?: boolean };
type RowValidation = { section: string; ok: boolean; issues: ProvIssue[]; wq: boolean };
type ExportValidation = { rows: Map<string, RowValidation>; failing: RowValidation[]; wqFailing: RowValidation[]; ok: boolean };

function validateExport(file: ExportFile): ExportValidation {
  const rows = new Map<string, RowValidation>();
  const failing: RowValidation[] = [];
  const wqFailing: RowValidation[] = [];
  const declaredDialects = new Set(
    Array.isArray(file.metadata?.source_dialects) ? (file.metadata!.source_dialects as string[]) : [],
  );
  for (const r of file.rows) {
    const issues: ProvIssue[] = [];
    const p = r.provenance;
    const isWQ = isWQSection(r.section);
    if (!p) {
      issues.push({ field: "provenance", message: "row is missing provenance block" });
    } else {
      for (const f of REQUIRED_PROV_FIELDS) {
        const v = (p as Record<string, unknown>)[f];
        if (v === undefined || v === null || v === "") {
          issues.push({ field: `provenance.${f}`, message: "required field is missing or empty" });
        }
      }
      if (p.original_inp_section && p.original_inp_section !== r.section) {
        issues.push({ field: "provenance.original_inp_section", message: `expected "${r.section}" but got "${p.original_inp_section}"` });
      }
      const rowDialects = r.dialects ?? p.source_dialects ?? ["SWMM5", "SWMM6"];
      if (p.source_dialect && !rowDialects.includes(p.source_dialect)) {
        issues.push({ field: "provenance.source_dialect", message: `"${p.source_dialect}" is not one of the row's dialects (${rowDialects.join(", ")})` });
      }
      if (declaredDialects.size > 0 && p.source_dialect && !declaredDialects.has(p.source_dialect)) {
        issues.push({ field: "provenance.source_dialect", message: `"${p.source_dialect}" is not in file's source_dialects (${[...declaredDialects].join(", ")})` });
      }
    }

    // Water-quality specific checks (v1.0 first-class scope)
    if (isWQ) {
      if (r.kind !== "quality") {
        issues.push({ field: "kind", message: `water-quality section must have kind="quality" (got "${r.kind ?? "∅"}")`, wq: true });
      }
      const target = String(r.target ?? "");
      if (!/^quality\//.test(target)) {
        issues.push({ field: "target", message: `water-quality section must target "quality/*" (got "${target || "∅"}")`, wq: true });
      }
      if (p && p.original_inp_section && p.original_inp_section !== r.section) {
        issues.push({ field: "provenance.original_inp_section", message: `WQ provenance section mismatch — declared "${p.original_inp_section}" for row "${r.section}"`, wq: true });
      }
      const rd = r.dialects ?? p?.source_dialects ?? ["SWMM5", "SWMM6"];
      if (!rd.includes("SWMM5") || !rd.includes("SWMM6")) {
        issues.push({ field: "dialects", message: `WQ sections must round-trip both SWMM5 and SWMM6 (row dialects: ${rd.join(", ") || "∅"})`, wq: true });
      }
    }

    const rv: RowValidation = { section: r.section, ok: issues.length === 0, issues, wq: isWQ };
    rows.set(r.section, rv);
    if (!rv.ok) {
      failing.push(rv);
      if (isWQ) wqFailing.push(rv);
    }
  }
  return { rows, failing, wqFailing, ok: failing.length === 0 };
}

function downloadValidationCSV(
  a: ExportFile | null,
  b: ExportFile | null,
  validation: { a: ExportValidation | null; b: ExportValidation | null },
  onlyFailing: boolean,
) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const now = new Date().toISOString();
  const lines: string[] = [
    `# swmmx_schema_version=${SWMMX_SCHEMA_VERSION}`,
    `# mapping_spec_revision=${MAPPING_SPEC_REVISION}`,
    `# tool=${TOOL_NAME}@${TOOL_VERSION} commit=${TOOL_COMMIT} build=${TOOL_BUILD_DATE}`,
    `# exported_at=${now}`,
    `# format=swmmx-diff-validation/csv`,
    `# only_failing=${onlyFailing}`,
    `# a_rows=${a?.rows.length ?? 0}`,
    `# b_rows=${b?.rows.length ?? 0}`,
    `# a_failing=${validation.a?.failing.length ?? 0}`,
    `# b_failing=${validation.b?.failing.length ?? 0}`,
    "side,section,ok,field,message",
  ];

  const addSide = (side: string, val: ExportValidation | null) => {
    if (!val) return;
    for (const rv of val.failing) {
      for (const issue of rv.issues) {
        lines.push(
          [side, rv.section, "false", issue.field, issue.message].map(esc).join(","),
        );
      }
    }
    if (!onlyFailing) {
      for (const rv of [...val.rows.values()].filter(r => r.ok)) {
        lines.push([side, rv.section, "true", "", ""].map(esc).join(","));
      }
    }
  };

  addSide("A", validation.a);
  addSide("B", validation.b);

  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const el = document.createElement("a");
  el.href = url;
  el.download = `swmmx-diff-validation-v${SWMMX_SCHEMA_VERSION}-${now.slice(0, 10)}.csv`;
  el.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Example loader — synthesizes two exports from the canonical MAPPING so users
// can inspect a non-empty diff (added / removed / changed / breaking) without
// producing real .inp exports first.
// ---------------------------------------------------------------------------
const EXAMPLE_TOOL_A = { version: "0.4.0", commit: "a1f3c92e", build: "2026-06-20" };
const EXAMPLE_TOOL_B = { version: "0.5.0", commit: "b7d20a11", build: "2026-07-24" };

function makeProv(section: string, dialect: string, tool: { version: string; commit: string; build: string }): Provenance {
  return {
    source_dialect: dialect,
    source_dialects: ["SWMM5", "SWMM6"],
    original_inp_section: section,
    tool: TOOL_NAME,
    tool_version: tool.version,
    tool_commit: tool.commit,
    tool_build_date: tool.build,
    spec_revision: MAPPING_SPEC_REVISION,
    schema_version: SWMMX_SCHEMA_VERSION,
  };
}

function makeExampleFile(
  which: "a" | "b",
  tool: { version: string; commit: string; build: string },
): ExportFile {
  const dialect = which === "a" ? "SWMM5" : "SWMM6";
  const base: ExportRow[] = MAPPING
    .filter(r => r.section !== "<unknown>")
    .map(r => ({
      ...r,
      dialects: r.dialects ?? ["SWMM5", "SWMM6"],
      provenance: makeProv(r.section, dialect, tool),
    }));

  const rows = base.map(r => ({ ...r, provenance: { ...r.provenance! } }));

  if (which === "b") {
    // Introduce a diverse set of drifts so the diff is illustrative.
    for (const r of rows) {
      switch (r.section) {
        case "[CONDUITS]":
          // BREAKING: target moved
          r.target = "topology/links.parquet kind=conduit (v2)";
          break;
        case "[JUNCTIONS]":
          // BREAKING: round-trip regressed lossless → semantic
          r.roundTrip = "semantic";
          break;
        case "[STORAGE]":
          // BREAKING: dialect dropped
          r.dialects = ["SWMM6"];
          break;
        case "[POLLUTANTS]":
          // BREAKING: kind changed (WQ)
          r.kind = "topology";
          break;
        case "[TREATMENT]":
          // NON-BREAKING: notes copy-edit
          r.notes = r.notes + " · clarified verbatim retention";
          break;
        case "[RAINGAGES]":
          // NON-BREAKING: round-trip improved semantic → lossless (already lossless — force semantic→lossless via A tweak below)
          r.roundTrip = "lossless";
          break;
      }
      // Tool version bump is audit-only (non-breaking) across every row.
      if (r.provenance) {
        r.provenance.tool_version = tool.version;
        r.provenance.tool_commit = tool.commit;
        r.provenance.tool_build_date = tool.build;
      }
    }

    // Removed section (BREAKING): drop [LABELS]
    const idxLabels = rows.findIndex(r => r.section === "[LABELS]");
    if (idxLabels >= 0) rows.splice(idxLabels, 1);

    // Added section (non-breaking): brand-new WQ passthrough
    rows.push({
      section: "[SNOWPACKS]",
      target: "forcings/snowpacks.parquet",
      kind: "forcings",
      roundTrip: "lossless",
      notes: "New in candidate export",
      dialects: ["SWMM5", "SWMM6"],
      provenance: makeProv("[SNOWPACKS]", dialect, tool),
    });
  } else {
    // Seed A with a non-lossless [RAINGAGES] so B's improvement is visible.
    const rg = rows.find(r => r.section === "[RAINGAGES]");
    if (rg) rg.roundTrip = "semantic";
  }

  return {
    metadata: {
      swmmx_schema_version: SWMMX_SCHEMA_VERSION,
      mapping_spec_revision: MAPPING_SPEC_REVISION,
      exported_at: which === "a" ? "2026-06-20T09:15:00Z" : "2026-07-24T14:02:00Z",
      source_dialects: [dialect],
      provenance: {
        tool: TOOL_NAME,
        tool_version: tool.version,
        tool_commit: tool.commit,
        tool_build_date: tool.build,
        input_inp_dialect: dialect,
      },
    },
    rows,
  };
}

function DiffPage() {
  const [a, setA] = useState<ExportFile | null>(null);
  const [b, setB] = useState<ExportFile | null>(null);
  const [errA, setErrA] = useState<string | null>(null);
  const [errB, setErrB] = useState<string | null>(null);

  const handleFile = async (side: Side, file: File | undefined) => {
    if (!file) return;
    const setData = side === "a" ? setA : setB;
    const setErr = side === "a" ? setErrA : setErrB;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || !Array.isArray(parsed.rows)) {
        throw new Error("Missing `rows` array. Use the JSON export from the mapping page.");
      }
      setErr(null);
      setData(parsed as ExportFile);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to parse JSON");
      setData(null);
    }
  };

  const [onlyFailing, setOnlyFailing] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (s: string) => setExpanded(prev => {
    const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n;
  });

  const validation = useMemo(() => {
    return {
      a: a ? validateExport(a) : null,
      b: b ? validateExport(b) : null,
    };
  }, [a, b]);

  const diff = useMemo(() => {
    if (!a || !b) return null;
    const ma = new Map(a.rows.map(r => [r.section, r]));
    const mb = new Map(b.rows.map(r => [r.section, r]));
    const sections = new Set<string>([...ma.keys(), ...mb.keys()]);
    const added: string[] = [];
    const removed: string[] = [];
    const changed: Array<{ section: string; fields: Array<{ field: string; reason: string; a: string; b: string }>; reasons: Set<string>; aRow: ExportRow; bRow: ExportRow }> = [];
    const unchanged: string[] = [];
    for (const s of [...sections].sort()) {
      const ra = ma.get(s); const rb = mb.get(s);
      if (!ra && rb) { added.push(s); continue; }
      if (ra && !rb) { removed.push(s); continue; }
      if (ra && rb) {
        const fields: Array<{ field: string; reason: string; a: string; b: string }> = [];
        const reasons = new Set<string>();
        for (const spec of FIELD_SPECS) {
          const va = spec.get(ra); const vb = spec.get(rb);
          if (va !== vb) { fields.push({ field: spec.label, reason: spec.reason, a: va, b: vb }); reasons.add(spec.reason); }
        }
        if (fields.length === 0) unchanged.push(s);
        else changed.push({ section: s, fields, reasons, aRow: ra, bRow: rb });
      }
    }
    return { added, removed, changed, unchanged };
  }, [a, b]);



  return (
    <div className="max-w-5xl">
      <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Spec 1 · Diff</div>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Mapping spec diff</h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-7 text-muted-foreground">
        Load two JSON exports from the mapping page to compare them. Diff is keyed by{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-[13px]">.section</code> and compares{" "}
        target, kind, round-trip, notes, and dialects.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FilePane side="a" label="A · base" file={a} err={errA} onFile={(f) => handleFile("a", f)} />
        <FilePane side="b" label="B · candidate" file={b} err={errB} onFile={(f) => handleFile("b", f)} />
      </div>

      {a && b && (
        <ProvenanceCompare a={a} b={b} />
      )}

      {(validation.a || validation.b) && (
        <ValidationSummary a={validation.a} b={validation.b} />
      )}

      {(validation.a || validation.b) && (
        <div className="mt-3 flex items-center justify-end gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">
            <Switch
              checked={onlyFailing}
              onCheckedChange={setOnlyFailing}
            />
            Only failing rows
          </label>
          <button
            onClick={() => downloadValidationCSV(a, b, validation, onlyFailing)}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-foreground/80 hover:bg-accent hover:text-foreground"
          >
            Download validation CSV
          </button>
        </div>
      )}

      {(validation.a?.failing.length || validation.b?.failing.length) ? (
        <FailingRowsPanel a={validation.a} b={validation.b} />
      ) : null}

      {(validation.a || validation.b) && (
        <WaterQualityPanel a={validation.a} b={validation.b} aFile={a} bFile={b} />
      )}

      {diff && (
        <div className="mt-8 space-y-6">
          <SummaryBar
            counts={{
              added: diff.added.length,
              removed: diff.removed.length,
              changed: diff.changed.length,
              unchanged: diff.unchanged.length,
            }}
          />

          <DiffSection title="Added" tone="emerald" empty="No new sections.">
            {diff.added.map(s => {
              const row = b!.rows.find(r => r.section === s)!;
              const v = validation.b?.rows.get(s);
              return <RowLine key={s} section={s} row={row} validations={{ b: v }} />;
            })}
          </DiffSection>

          <DiffSection title="Removed" tone="rose" empty="No removed sections.">
            {diff.removed.map(s => {
              const row = a!.rows.find(r => r.section === s)!;
              const v = validation.a?.rows.get(s);
              return <RowLine key={s} section={s} row={row} validations={{ a: v }} />;
            })}
          </DiffSection>

          <DiffSection title="Changed" tone="amber" empty="No field-level changes.">
            {diff.changed.map(c => {
              const va = validation.a?.rows.get(c.section);
              const vb = validation.b?.rows.get(c.section);
              const isOpen = expanded.has(c.section);
              const hasProvChange = [...c.reasons].some(r => r.startsWith("provenance:"));
              return (
                <div key={c.section} className="rounded-md border border-border bg-card p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-mono text-[12.5px] text-foreground">{c.section}</div>
                    <div className="flex flex-wrap gap-1">
                      {[...c.reasons].map(r => (
                        <span key={r} className={`rounded border px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider ${REASON_LABEL[r]?.color ?? ""}`}>
                          {REASON_LABEL[r]?.label ?? r}
                        </span>
                      ))}
                      <ValidityBadge side="A" v={va} />
                      <ValidityBadge side="B" v={vb} />
                    </div>
                    {hasProvChange && (
                      <button
                        onClick={() => toggleExpanded(c.section)}
                        className="ml-auto rounded border border-border bg-background px-2 py-0.5 text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground"
                      >
                        {isOpen ? "hide provenance" : "show provenance"}
                      </button>
                    )}
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {c.fields.map(f => (
                      <div key={f.field} className="grid grid-cols-[150px_1fr] gap-3 text-[12.5px]">
                        <div className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">{f.field}</div>
                        <div className="space-y-0.5">
                          <div className="font-mono text-rose-300/90">- {f.a || <em className="not-italic text-muted-foreground">∅</em>}</div>
                          <div className="font-mono text-emerald-300/90">+ {f.b || <em className="not-italic text-muted-foreground">∅</em>}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {isOpen && (
                    <ProvenanceDrilldown aRow={c.aRow} bRow={c.bRow} reasons={c.reasons} va={va} vb={vb} />
                  )}
                </div>
              );
            })}
          </DiffSection>

        </div>
      )}

      <OpenSwmmContext compact />
    </div>
  );
}

function ValidityBadge({ side, v }: { side: string; v?: RowValidation }) {
  if (!v) return null;
  const ok = v.ok;
  return (
    <span
      title={ok ? "provenance validated" : v.issues.map(i => `${i.field}: ${i.message}`).join("\n")}
      className={`rounded border px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider ${
        ok
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
          : "border-rose-500/40 bg-rose-500/10 text-rose-300"
      }`}
    >
      {side} · {ok ? "prov ok" : `prov ✗ ${v.issues.length}`}
    </span>
  );
}

function ValidationSummary({ a, b }: { a: ExportValidation | null; b: ExportValidation | null }) {
  const cell = (side: string, v: ExportValidation | null) => {
    if (!v) return (
      <div className="rounded-md border border-border bg-card p-3">
        <div className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">{side}</div>
        <div className="mt-1 text-xs text-muted-foreground">no file loaded</div>
      </div>
    );
    const total = v.rows.size;
    const failing = v.failing.length;
    const tone = v.ok ? "border-emerald-500/40 bg-emerald-500/5" : "border-rose-500/40 bg-rose-500/5";
    const color = v.ok ? "text-emerald-300" : "text-rose-300";
    return (
      <div className={`rounded-md border p-3 ${tone}`}>
        <div className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">{side} · provenance validation</div>
        <div className={`mt-1 font-mono text-[11.5px] uppercase tracking-wider ${color}`}>
          {v.ok ? `${total} rows passed` : `${failing} of ${total} rows failed`}
        </div>
      </div>
    );
  };
  return (
    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
      {cell("A · base", a)}
      {cell("B · candidate", b)}
    </div>
  );
}

function FailingRowsPanel({ a, b }: { a: ExportValidation | null; b: ExportValidation | null }) {
  const merge = () => {
    const sections = new Set<string>([
      ...(a?.failing ?? []).map(r => r.section),
      ...(b?.failing ?? []).map(r => r.section),
    ]);
    return [...sections].sort().map(s => ({
      section: s,
      a: a?.rows.get(s),
      b: b?.rows.get(s),
    }));
  };
  const list = merge();
  if (list.length === 0) return null;
  return (
    <div className="mt-4 rounded-md border border-rose-500/40 bg-rose-500/5 p-3">
      <div className="flex items-center justify-between">
        <div className="font-mono text-[10.5px] uppercase tracking-wider text-rose-300">Failing provenance rows</div>
        <div className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">{list.length} sections</div>
      </div>
      <div className="mt-3 space-y-2">
        {list.map(({ section, a: va, b: vb }) => (
          <div key={section} className="rounded border border-border bg-card p-2.5">
            <div className="font-mono text-[12.5px] text-foreground">{section}</div>
            <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <FailingSide label="A" v={va} />
              <FailingSide label="B" v={vb} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FailingSide({ label, v }: { label: string; v?: RowValidation }) {
  if (!v) return (
    <div className="rounded border border-border/60 bg-background p-2">
      <div className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-[12px] text-muted-foreground">row not present</div>
    </div>
  );
  if (v.ok) return (
    <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-2">
      <div className="font-mono text-[10.5px] uppercase tracking-wider text-emerald-300">{label} · passed</div>
    </div>
  );
  return (
    <div className="rounded border border-rose-500/30 bg-rose-500/5 p-2">
      <div className="font-mono text-[10.5px] uppercase tracking-wider text-rose-300">{label} · {v.issues.length} issue(s)</div>
      <ul className="mt-1 space-y-0.5 text-[12px]">
        {v.issues.map((i, idx) => (
          <li key={idx}>
            <span className="font-mono text-foreground/80">{i.field}</span>{" "}
            <span className="text-muted-foreground">— {i.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProvenanceDrilldown({
  aRow, bRow, reasons, va, vb,
}: {
  aRow: ExportRow; bRow: ExportRow; reasons: Set<string>;
  va?: RowValidation; vb?: RowValidation;
}) {
  const highlightFields: string[] = [];
  if (reasons.has("provenance:dialect")) highlightFields.push("source_dialect");
  if (reasons.has("provenance:inp_section")) highlightFields.push("original_inp_section");
  if (reasons.has("provenance:tool_version")) highlightFields.push("tool", "tool_version");
  const pa = (aRow.provenance ?? {}) as Record<string, unknown>;
  const pb = (bRow.provenance ?? {}) as Record<string, unknown>;
  const keys = Array.from(new Set([...Object.keys(pa), ...Object.keys(pb), ...highlightFields])).sort();
  return (
    <div className="mt-3 rounded border border-border bg-background/60 p-3">
      <div className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">
        Provenance drilldown · highlighting: {highlightFields.length ? highlightFields.join(", ") : "—"}
      </div>
      <div className="mt-2 grid grid-cols-[160px_1fr_1fr] gap-x-3 gap-y-1 text-[12px]">
        <div />
        <div className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">A · {va?.ok === false ? "prov ✗" : "prov ok"}</div>
        <div className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">B · {vb?.ok === false ? "prov ✗" : "prov ok"}</div>
        {keys.map(k => {
          const va2 = pa[k]; const vb2 = pb[k];
          const va2s = va2 === undefined ? "∅" : Array.isArray(va2) ? va2.join("|") : String(va2);
          const vb2s = vb2 === undefined ? "∅" : Array.isArray(vb2) ? vb2.join("|") : String(vb2);
          const differs = va2s !== vb2s;
          const highlighted = highlightFields.includes(k);
          return (
            <Fragment key={k}>
              <div className={`font-mono text-[10.5px] uppercase tracking-wider ${highlighted ? "text-foreground" : "text-muted-foreground"}`}>{k}</div>
              <div className={`font-mono ${differs ? "text-rose-300/90" : "text-foreground/80"} ${highlighted ? "bg-rose-500/5 rounded px-1" : ""}`}>{va2s}</div>
              <div className={`font-mono ${differs ? "text-emerald-300/90" : "text-foreground/80"} ${highlighted ? "bg-emerald-500/5 rounded px-1" : ""}`}>{vb2s}</div>
            </Fragment>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <pre className="max-h-64 overflow-auto rounded border border-border bg-muted/20 p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
{JSON.stringify(aRow.provenance ?? {}, null, 2)}
        </pre>
        <pre className="max-h-64 overflow-auto rounded border border-border bg-muted/20 p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
{JSON.stringify(bRow.provenance ?? {}, null, 2)}
        </pre>
      </div>
    </div>
  );
}


function FilePane({
  side, label, file, err, onFile,
}: { side: Side; label: string; file: ExportFile | null; err: string | null; onFile: (f: File | undefined) => void }) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <label className="cursor-pointer rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider hover:bg-accent">
          Load JSON
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={e => onFile(e.currentTarget.files?.[0])}
          />
        </label>
      </div>
      {err && <div className="mt-3 text-xs text-rose-400">{err}</div>}
      {file ? (
        <dl className="mt-3 space-y-1 text-[12px] text-muted-foreground">
          <Field k="schema" v={String(file.metadata?.swmmx_schema_version ?? "—")} />
          <Field k="spec rev" v={String(file.metadata?.mapping_spec_revision ?? "—")} />
          <Field k="exported" v={String(file.metadata?.exported_at ?? "—")} />
          <Field k="rows" v={String(file.rows.length)} />
        </dl>
      ) : (
        <div className="mt-3 text-xs text-muted-foreground">
          {side === "a" ? "Drop a baseline export here." : "Drop a candidate export here."}
        </div>
      )}
    </div>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 font-mono text-[10.5px] uppercase tracking-wider">{k}</dt>
      <dd className="font-mono text-foreground/80">{v}</dd>
    </div>
  );
}

function ProvenanceCompare({ a, b }: { a: ExportFile; b: ExportFile }) {
  const pa = (a.metadata?.provenance ?? {}) as Record<string, unknown>;
  const pb = (b.metadata?.provenance ?? {}) as Record<string, unknown>;
  const keys = Array.from(new Set([...Object.keys(pa), ...Object.keys(pb)])).sort();
  if (keys.length === 0) return null;
  return (
    <div className="mt-4 rounded-md border border-border bg-card p-3">
      <div className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">Provenance</div>
      <div className="mt-2 grid grid-cols-[130px_1fr_1fr] gap-x-4 gap-y-1 text-[12px]">
        <div />
        <div className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">A</div>
        <div className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">B</div>
        {keys.map(k => {
          const va = String(pa[k] ?? "—"); const vb = String(pb[k] ?? "—");
          const differs = va !== vb;
          return (
            <Fragment key={k}>
              <div className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">{k}</div>
              <div className={`font-mono ${differs ? "text-rose-300/90" : "text-foreground/80"}`}>{va}</div>
              <div className={`font-mono ${differs ? "text-emerald-300/90" : "text-foreground/80"}`}>{vb}</div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

function SummaryBar({ counts }: { counts: { added: number; removed: number; changed: number; unchanged: number } }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat label="added" n={counts.added} color="text-emerald-400" />
      <Stat label="removed" n={counts.removed} color="text-rose-400" />
      <Stat label="changed" n={counts.changed} color="text-amber-400" />
      <Stat label="unchanged" n={counts.unchanged} color="text-muted-foreground" />
    </div>
  );
}

function Stat({ label, n, color }: { label: string; n: number; color: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className={`text-2xl font-semibold tabular-nums ${color}`}>{n}</div>
      <div className="mt-0.5 font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function DiffSection({
  title, tone, empty, children,
}: { title: string; tone: "emerald" | "rose" | "amber"; empty: string; children: React.ReactNode }) {
  const arr = Array.isArray(children) ? children : [children];
  const isEmpty = arr.filter(Boolean).length === 0;
  const toneClass = {
    emerald: "text-emerald-400",
    rose: "text-rose-400",
    amber: "text-amber-400",
  }[tone];
  return (
    <section>
      <h2 className={`font-mono text-[11px] uppercase tracking-wider ${toneClass}`}>{title}</h2>
      <div className="mt-2 space-y-2">
        {isEmpty ? <div className="text-xs text-muted-foreground">{empty}</div> : children}
      </div>
    </section>
  );
}

function RowLine({
  section, row, validations,
}: {
  section: string; row: ExportRow;
  validations?: { a?: RowValidation; b?: RowValidation };
}) {
  const kind = row.kind as MappingRow["kind"];
  const rt = row.roundTrip as MappingRow["roundTrip"];
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md border border-border bg-card px-3 py-2 text-[12.5px]">
      <span className="font-mono text-foreground">{section}</span>
      <span className="font-mono text-foreground/70">→ {row.target}</span>
      <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${KIND_COLOR[kind]}`}>{kind}</span>
      <span className={`font-mono text-[10.5px] uppercase tracking-wider ${RT_COLOR[rt]}`}>{rt}</span>
      {validations?.a && <ValidityBadge side="A" v={validations.a} />}
      {validations?.b && <ValidityBadge side="B" v={validations.b} />}
    </div>
  );
}

function WaterQualityPanel({
  a, b, aFile, bFile,
}: {
  a: ExportValidation | null; b: ExportValidation | null;
  aFile: ExportFile | null; bFile: ExportFile | null;
}) {
  const wqSections = WATER_QUALITY_SECTIONS as readonly string[];
  const rowsA = new Map<string, ExportRow>();
  const rowsB = new Map<string, ExportRow>();
  aFile?.rows.forEach(r => { if (isWQSection(r.section)) rowsA.set(r.section, r); });
  bFile?.rows.forEach(r => { if (isWQSection(r.section)) rowsB.set(r.section, r); });

  const aFailCount = a?.wqFailing.length ?? 0;
  const bFailCount = b?.wqFailing.length ?? 0;
  const aWQTotal = [...(a?.rows.values() ?? [])].filter(r => r.wq).length;
  const bWQTotal = [...(b?.rows.values() ?? [])].filter(r => r.wq).length;

  // Cross-file provenance mismatches, limited to WQ sections
  type Mismatch = { section: string; field: string; a: string; b: string };
  const mismatches: Mismatch[] = [];
  for (const s of wqSections) {
    const ra = rowsA.get(s); const rb = rowsB.get(s);
    if (!ra || !rb) continue;
    const pairs: Array<[string, string, string]> = [
      ["target", String(ra.target ?? ""), String(rb.target ?? "")],
      ["kind", String(ra.kind ?? ""), String(rb.kind ?? "")],
      ["dialects", (ra.dialects ?? []).slice().sort().join("|"), (rb.dialects ?? []).slice().sort().join("|")],
      ["prov.source_dialect", String(ra.provenance?.source_dialect ?? ""), String(rb.provenance?.source_dialect ?? "")],
      ["prov.original_inp_section", String(ra.provenance?.original_inp_section ?? ""), String(rb.provenance?.original_inp_section ?? "")],
      ["prov.tool_version", `${ra.provenance?.tool ?? ""}@${ra.provenance?.tool_version ?? ""}`, `${rb.provenance?.tool ?? ""}@${rb.provenance?.tool_version ?? ""}`],
    ];
    for (const [f, va, vb] of pairs) {
      if (va !== vb) mismatches.push({ section: s, field: f, a: va, b: vb });
    }
  }

  const anyFailing = aFailCount + bFailCount + mismatches.length > 0;
  const tone = anyFailing
    ? "border-cyan-500/40 bg-cyan-500/5"
    : "border-cyan-500/30 bg-cyan-500/5";

  return (
    <div className={`mt-4 rounded-md border p-3 ${tone}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-mono text-[10.5px] uppercase tracking-wider text-cyan-300">
          Water quality · v1.0 first-class
        </div>
        <div className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">
          A {aWQTotal ? `${aFailCount}/${aWQTotal} failing` : "no wq rows"}
          {" · "}
          B {bWQTotal ? `${bFailCount}/${bWQTotal} failing` : "no wq rows"}
          {" · "}
          {mismatches.length} cross-file mismatches
        </div>
      </div>

      {(aFailCount + bFailCount) > 0 && (
        <div className="mt-3 space-y-2">
          <div className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">
            Failing water-quality rows
          </div>
          {wqSections
            .filter(s => a?.rows.get(s)?.ok === false || b?.rows.get(s)?.ok === false)
            .map(s => {
              const va = a?.rows.get(s); const vb = b?.rows.get(s);
              return (
                <div key={s} className="rounded border border-border bg-card p-2.5">
                  <div className="font-mono text-[12.5px] text-foreground">{s}</div>
                  <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <FailingSide label="A" v={va} />
                    <FailingSide label="B" v={vb} />
                  </div>
                  {(va?.issues.filter(i => i.wq).length || vb?.issues.filter(i => i.wq).length) ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {[...(va?.issues.filter(i => i.wq) ?? []), ...(vb?.issues.filter(i => i.wq) ?? [])].map((i, idx) => (
                        <span key={idx} className="rounded border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-cyan-300">
                          wq · {i.field}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
        </div>
      )}

      {mismatches.length > 0 && (
        <div className="mt-3">
          <div className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">
            Cross-file water-quality field mismatches
          </div>
          <div className="mt-1.5 overflow-hidden rounded border border-border">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="bg-muted/40 text-left text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  <th className="px-2 py-1.5 font-medium">Section</th>
                  <th className="px-2 py-1.5 font-medium">Field</th>
                  <th className="px-2 py-1.5 font-medium">A</th>
                  <th className="px-2 py-1.5 font-medium">B</th>
                </tr>
              </thead>
              <tbody>
                {mismatches.map((m, i) => (
                  <tr key={i} className="border-t border-border align-top">
                    <td className="px-2 py-1.5 font-mono text-foreground">{m.section}</td>
                    <td className="px-2 py-1.5 font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">{m.field}</td>
                    <td className="px-2 py-1.5 font-mono text-rose-300/90">{m.a || "∅"}</td>
                    <td className="px-2 py-1.5 font-mono text-emerald-300/90">{m.b || "∅"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!anyFailing && (
        <div className="mt-2 text-[12px] text-muted-foreground">
          All water-quality sections pass provenance checks and match across both files.
        </div>
      )}
    </div>
  );
}


