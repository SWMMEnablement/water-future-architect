import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { KIND_COLOR, RT_COLOR, type MappingRow } from "../lib/inp-mapping";

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

const REQUIRED_PROV_FIELDS = [
  "source_dialect", "original_inp_section",
  "tool", "tool_version", "tool_commit", "tool_build_date",
  "spec_revision", "schema_version",
] as const;

type ProvIssue = { field: string; message: string };
type RowValidation = { section: string; ok: boolean; issues: ProvIssue[] };
type ExportValidation = { rows: Map<string, RowValidation>; failing: RowValidation[]; ok: boolean };

function validateExport(file: ExportFile): ExportValidation {
  const rows = new Map<string, RowValidation>();
  const failing: RowValidation[] = [];
  const declaredDialects = new Set(
    Array.isArray(file.metadata?.source_dialects) ? (file.metadata!.source_dialects as string[]) : [],
  );
  for (const r of file.rows) {
    const issues: ProvIssue[] = [];
    const p = r.provenance;
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
    const rv: RowValidation = { section: r.section, ok: issues.length === 0, issues };
    rows.set(r.section, rv);
    if (!rv.ok) failing.push(rv);
  }
  return { rows, failing, ok: failing.length === 0 };
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

  const diff = useMemo(() => {
    if (!a || !b) return null;
    const ma = new Map(a.rows.map(r => [r.section, r]));
    const mb = new Map(b.rows.map(r => [r.section, r]));
    const sections = new Set<string>([...ma.keys(), ...mb.keys()]);
    const added: string[] = [];
    const removed: string[] = [];
    const changed: Array<{ section: string; fields: Array<{ field: string; reason: string; a: string; b: string }>; reasons: Set<string> }> = [];
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
        else changed.push({ section: s, fields, reasons });
      }
    }
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
            {diff.added.map(s => (
              <RowLine key={s} section={s} row={b!.rows.find(r => r.section === s)!} />
            ))}
          </DiffSection>

          <DiffSection title="Removed" tone="rose" empty="No removed sections.">
            {diff.removed.map(s => (
              <RowLine key={s} section={s} row={a!.rows.find(r => r.section === s)!} />
            ))}
          </DiffSection>

          <DiffSection title="Changed" tone="amber" empty="No field-level changes.">
            {diff.changed.map(c => (
              <div key={c.section} className="rounded-md border border-border bg-card p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-mono text-[12.5px] text-foreground">{c.section}</div>
                  <div className="flex flex-wrap gap-1">
                    {[...c.reasons].map(r => (
                      <span key={r} className={`rounded border px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider ${REASON_LABEL[r]?.color ?? ""}`}>
                        {REASON_LABEL[r]?.label ?? r}
                      </span>
                    ))}
                  </div>
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
              </div>
            ))}
          </DiffSection>

        </div>
      )}
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

function RowLine({ section, row }: { section: string; row: ExportRow }) {
  const kind = row.kind as MappingRow["kind"];
  const rt = row.roundTrip as MappingRow["roundTrip"];
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md border border-border bg-card px-3 py-2 text-[12.5px]">
      <span className="font-mono text-foreground">{section}</span>
      <span className="font-mono text-foreground/70">→ {row.target}</span>
      <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${KIND_COLOR[kind]}`}>{kind}</span>
      <span className={`font-mono text-[10.5px] uppercase tracking-wider ${RT_COLOR[rt]}`}>{rt}</span>
    </div>
  );
}
