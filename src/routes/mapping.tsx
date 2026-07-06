import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { OpenSwmmContext } from "@/components/openswmm-context";
import {
  MAPPING,
  KIND_COLOR,
  RT_COLOR,
  SWMMX_SCHEMA_VERSION,
  MAPPING_SPEC_REVISION,
  SWMMX_SOURCE_DIALECTS,
  TOOL_NAME,
  TOOL_VERSION,
  TOOL_COMMIT,
  TOOL_BUILD_DATE,
  WATER_QUALITY_SECTIONS,
  WATER_QUALITY_FIELDS,
  rowDialects,
  type Dialect,
  type MappingRow,
} from "../lib/inp-mapping";

export const Route = createFileRoute("/mapping")({
  head: () => ({
    meta: [
      { title: ".inp ↔ SWMM-X Mapping — SWMM-X Docs" },
      { name: "description", content: "Section-by-section mapping from EPA-SWMM5/6 .inp to the SWMM-X (SXPF) project format." },
    ],
  }),
  component: MappingPage,
});

const KINDS: Array<MappingRow["kind"] | "all"> = [
  "all", "topology", "forcings", "scenarios", "manifest", "controls", "quality", "ui", "passthrough",
];

type DialectFilter = "all" | Dialect;

function MappingPage() {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<MappingRow["kind"] | "all">("all");
  const [dialect, setDialect] = useState<DialectFilter>("all");
  const [inputDialect, setInputDialect] = useState<Dialect>("SWMM5");
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [drawerRow, setDrawerRow] = useState<MappingRow | null>(null);

  const rowProvenance = (r: MappingRow) => {
    const dialects = rowDialects(r);
    return {
      source_dialect: dialects.includes(inputDialect) ? inputDialect : dialects[0],
      source_dialects: dialects,
      original_inp_section: r.section,
      tool: TOOL_NAME,
      tool_version: TOOL_VERSION,
      tool_commit: TOOL_COMMIT,
      tool_build_date: TOOL_BUILD_DATE,
      spec_revision: MAPPING_SPEC_REVISION,
      schema_version: SWMMX_SCHEMA_VERSION,
    };
  };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return MAPPING.filter(r => {
      if (kind !== "all" && r.kind !== kind) return false;
      if (dialect !== "all" && !rowDialects(r).includes(dialect)) return false;
      if (selectedSections.size > 0 && !selectedSections.has(r.section)) return false;
      if (!needle) return true;
      return (
        r.section.toLowerCase().includes(needle) ||
        r.target.toLowerCase().includes(needle) ||
        r.notes.toLowerCase().includes(needle)
      );
    });
  }, [q, kind, dialect, selectedSections]);

  const toggleSection = (s: string) =>
    setSelectedSections(prev => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });

  const buildMetadata = (fmt: "csv" | "json") => ({
    format: `swmmx-inp-mapping/${fmt}`,
    swmmx_schema_version: SWMMX_SCHEMA_VERSION,
    mapping_spec_revision: MAPPING_SPEC_REVISION,
    source_dialects: SWMMX_SOURCE_DIALECTS,
    provenance: {
      tool: TOOL_NAME,
      tool_version: TOOL_VERSION,
      commit: TOOL_COMMIT,
      build_date: TOOL_BUILD_DATE,
      input_inp_dialect: inputDialect,
      exporter: "web",
    },
    exported_at: new Date().toISOString(),
    row_count: rows.length,
    total_rows: MAPPING.length,
    filters: {
      search: q || null,
      kind,
      dialect,
      sections: selectedSections.size > 0 ? [...selectedSections].sort() : null,
    },
  });

  const REQUIRED_PROV_FIELDS = [
    "source_dialect", "original_inp_section",
    "tool", "tool_version", "tool_commit", "tool_build_date",
    "spec_revision", "schema_version",
  ] as const;

  type ValidationIssue = { level: "error" | "warning"; section: string; field: string; message: string };
  type ValidationResult = { checkedRows: number; issues: ValidationIssue[]; ok: boolean };

  const validateEnriched = (
    enriched: Array<MappingRow & { dialects: Dialect[]; provenance: ReturnType<typeof rowProvenance> }>,
  ): ValidationResult => {
    const issues: ValidationIssue[] = [];
    const sectionsFilter = selectedSections.size > 0 ? selectedSections : null;
    for (const r of enriched) {
      const p = r.provenance as Record<string, unknown> | undefined;
      if (!p) {
        issues.push({ level: "error", section: r.section, field: "provenance", message: "row is missing provenance block" });
        continue;
      }
      for (const f of REQUIRED_PROV_FIELDS) {
        const v = p[f];
        if (v === undefined || v === null || v === "") {
          issues.push({ level: "error", section: r.section, field: `provenance.${f}`, message: "required provenance field is missing or empty" });
        }
      }
      if (p.original_inp_section !== r.section) {
        issues.push({ level: "error", section: r.section, field: "provenance.original_inp_section", message: `expected "${r.section}" but got "${String(p.original_inp_section)}"` });
      }
      const sd = String(p.source_dialect ?? "");
      if (sd && !r.dialects.includes(sd as Dialect)) {
        issues.push({ level: "error", section: r.section, field: "provenance.source_dialect", message: `"${sd}" is not one of the row's dialects (${r.dialects.join(", ")})` });
      }
      if (dialect !== "all" && sd && sd !== dialect && r.dialects.includes(dialect)) {
        issues.push({ level: "warning", section: r.section, field: "provenance.source_dialect", message: `dialect filter is "${dialect}" but row provenance uses "${sd}"` });
      }
      if (sectionsFilter && !sectionsFilter.has(r.section)) {
        issues.push({ level: "error", section: r.section, field: "section", message: "row is outside the selected sections filter" });
      }
      if (p.tool !== TOOL_NAME || p.tool_version !== TOOL_VERSION) {
        issues.push({ level: "warning", section: r.section, field: "provenance.tool_version", message: `tool ${String(p.tool)}@${String(p.tool_version)} differs from build ${TOOL_NAME}@${TOOL_VERSION}` });
      }
      if (p.spec_revision !== MAPPING_SPEC_REVISION || p.schema_version !== SWMMX_SCHEMA_VERSION) {
        issues.push({ level: "warning", section: r.section, field: "provenance.spec_revision", message: `row references spec ${String(p.spec_revision)} / schema v${String(p.schema_version)}` });
      }
    }
    return {
      checkedRows: enriched.length,
      issues,
      ok: issues.every(i => i.level !== "error"),
    };
  };

  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [pendingExport, setPendingExport] = useState<"csv" | "json" | null>(null);

  const runValidation = () => {
    const enriched = rows.map(r => ({
      ...r,
      dialects: rowDialects(r),
      provenance: rowProvenance(r),
    }));
    const result = validateEnriched(enriched);
    setValidation(result);
    return result;
  };

  const doDownload = (fmt: "csv" | "json") => {
    const meta = buildMetadata(fmt);
    const stamp = meta.exported_at.slice(0, 10);
    const enriched = rows.map(r => ({
      ...r,
      dialects: rowDialects(r),
      provenance: rowProvenance(r),
    }));
    let blob: Blob;
    let filename: string;
    if (fmt === "json") {
      blob = new Blob(
        [JSON.stringify({ metadata: meta, rows: enriched }, null, 2)],
        { type: "application/json" },
      );
      filename = `swmmx-inp-mapping-v${SWMMX_SCHEMA_VERSION}-${stamp}.json`;
    } else {
      const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
      const metaLines = [
        `# swmmx_schema_version=${SWMMX_SCHEMA_VERSION}`,
        `# mapping_spec_revision=${MAPPING_SPEC_REVISION}`,
        `# tool=${TOOL_NAME}@${TOOL_VERSION} commit=${TOOL_COMMIT} build=${TOOL_BUILD_DATE}`,
        `# input_inp_dialect=${inputDialect}`,
        `# source_dialects=${SWMMX_SOURCE_DIALECTS.join("|")}`,
        `# exported_at=${meta.exported_at}`,
        `# row_count=${rows.length} total_rows=${MAPPING.length}`,
        `# filter_search=${q || ""} filter_kind=${kind} filter_dialect=${dialect}`,
        `# filter_sections=${selectedSections.size > 0 ? [...selectedSections].sort().join("|") : ""}`,
      ];
      const header = [
        "section", "target", "kind", "round_trip", "dialects", "notes",
        "prov_source_dialect", "prov_original_inp_section",
        "prov_tool", "prov_tool_version", "prov_tool_commit", "prov_tool_build_date",
        "prov_spec_revision", "prov_schema_version",
      ];
      const lines = [
        ...metaLines,
        header.join(","),
        ...enriched.map(r =>
          [
            r.section, r.target, r.kind, r.roundTrip, r.dialects.join("|"), r.notes,
            r.provenance.source_dialect, r.provenance.original_inp_section,
            r.provenance.tool, r.provenance.tool_version, r.provenance.tool_commit, r.provenance.tool_build_date,
            r.provenance.spec_revision, r.provenance.schema_version,
          ].map(esc).join(","),
        ),
      ];
      blob = new Blob([lines.join("\n")], { type: "text/csv" });
      filename = `swmmx-inp-mapping-v${SWMMX_SCHEMA_VERSION}-${stamp}.csv`;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const download = (fmt: "csv" | "json") => {
    const result = runValidation();
    if (!result.ok) {
      setPendingExport(fmt);
      return;
    }
    setPendingExport(null);
    doDownload(fmt);
  };

  const forceDownload = () => {
    if (pendingExport) doDownload(pendingExport);
    setPendingExport(null);
  };


  return (
    <div className="max-w-5xl">
      <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Spec 1</div>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">.inp ↔ SWMM-X mapping</h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-7 text-muted-foreground">
        Every EPA-SWMM5/6 <code className="rounded bg-muted px-1 py-0.5 font-mono text-[13px]">.inp</code> section
        maps to a typed target in the SXPF directory. Unknown sections passthrough verbatim so round-trip is
        always possible.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search sections, targets, notes…"
          className="flex-1 min-w-[240px] rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-foreground/40"
        />
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map(k => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-md border px-2.5 py-1 text-xs font-mono uppercase tracking-wider transition-colors ${
                kind === k
                  ? "border-foreground/40 bg-accent text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground">Dialect</span>
          {(["all", ...SWMMX_SOURCE_DIALECTS] as DialectFilter[]).map(d => (
            <button
              key={d}
              onClick={() => setDialect(d)}
              className={`rounded-md border px-2.5 py-1 text-xs font-mono uppercase tracking-wider transition-colors ${
                dialect === d
                  ? "border-foreground/40 bg-accent text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
        <button
          onClick={() => setPickerOpen(o => !o)}
          className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-mono uppercase tracking-wider text-foreground/80 hover:bg-accent"
        >
          Sections {selectedSections.size > 0 ? `(${selectedSections.size})` : "(all)"}
        </button>
        {selectedSections.size > 0 && (
          <button
            onClick={() => setSelectedSections(new Set())}
            className="text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            clear
          </button>
        )}
      </div>

      {pickerOpen && (
        <div className="mt-3 rounded-md border border-border bg-card p-3">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Select sections to include in the export. Leave empty to export all.</span>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedSections(new Set(MAPPING.map(r => r.section)))}
                className="font-mono uppercase tracking-wider hover:text-foreground"
              >all</button>
              <button
                onClick={() => setSelectedSections(new Set())}
                className="font-mono uppercase tracking-wider hover:text-foreground"
              >none</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {MAPPING.map(r => {
              const active = selectedSections.has(r.section);
              return (
                <button
                  key={r.section}
                  onClick={() => toggleSection(r.section)}
                  className={`rounded border px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wider transition-colors ${
                    active
                      ? "border-foreground/40 bg-accent text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {r.section}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{rows.length} of {MAPPING.length} rows</span>
          <span className="font-mono text-[10.5px] uppercase tracking-wider">
            schema <span className="text-foreground/80">v{SWMMX_SCHEMA_VERSION}</span>
            <span className="mx-1.5 text-border">·</span>
            spec <span className="text-foreground/80">{MAPPING_SPEC_REVISION}</span>
            <span className="mx-1.5 text-border">·</span>
            tool <span className="text-foreground/80">{TOOL_NAME}@{TOOL_VERSION}</span>
            <span className="mx-1.5 text-border">·</span>
            commit <span className="text-foreground/80">{TOOL_COMMIT}</span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground">
            input
            <select
              value={inputDialect}
              onChange={e => setInputDialect(e.target.value as Dialect)}
              className="rounded border border-border bg-card px-2 py-1 text-xs text-foreground"
            >
              {SWMMX_SOURCE_DIALECTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <button
            onClick={runValidation}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-foreground/80 hover:bg-accent hover:text-foreground"
          >
            Validate
          </button>
          <button
            onClick={() => download("csv")}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-foreground/80 hover:bg-accent hover:text-foreground"
          >
            Download CSV
          </button>
          <button
            onClick={() => download("json")}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-foreground/80 hover:bg-accent hover:text-foreground"
          >
            Download JSON
          </button>
        </div>
      </div>

      {validation && (
        <ValidationPanel
          result={validation}
          pending={pendingExport}
          onDismiss={() => { setValidation(null); setPendingExport(null); }}
          onForce={forceDownload}
        />
      )}


      <div className="mt-4 overflow-hidden rounded-md border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/40 text-left text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 font-medium">.inp section</th>
              <th className="px-3 py-2 font-medium">SXPF target</th>
              <th className="px-3 py-2 font-medium">Kind</th>
              <th className="px-3 py-2 font-medium">Dialects</th>
              <th className="px-3 py-2 font-medium">Round-trip</th>
              <th className="px-3 py-2 font-medium">Notes</th>
              <th className="px-3 py-2 font-medium">Provenance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const prov = rowProvenance(r);
              return (
                <tr key={r.section + i} className="border-t border-border align-top hover:bg-accent/30">
                  <td className="px-3 py-2.5 font-mono text-[12.5px] text-foreground">{r.section}</td>
                  <td className="px-3 py-2.5 font-mono text-[12.5px] text-foreground/80">{r.target}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-block rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${KIND_COLOR[r.kind]}`}>
                      {r.kind}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">
                    {rowDialects(r).join(" · ")}
                  </td>
                  <td className={`px-3 py-2.5 font-mono text-[11px] uppercase tracking-wider ${RT_COLOR[r.roundTrip]}`}>
                    {r.roundTrip}
                  </td>
                  <td className="px-3 py-2.5 text-[13px] text-muted-foreground">{r.notes || "—"}</td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => setDrawerRow(r)}
                      className="flex flex-col items-start gap-0.5 rounded border border-border bg-card px-2 py-1 text-left font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                      title="View provenance"
                    >
                      <span className="text-foreground/80">{prov.source_dialect}</span>
                      <span>{TOOL_NAME}@{TOOL_VERSION}</span>
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-muted-foreground">No rows match.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {drawerRow && (
        <ProvenanceDrawer
          row={drawerRow}
          prov={rowProvenance(drawerRow)}
          onClose={() => setDrawerRow(null)}
        />
      )}


      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Legend color="text-emerald-400" label="lossless" desc="Bit-identical re-export of mapped content." />
        <Legend color="text-amber-400" label="semantic" desc="Reformatting or section merge; AST equality holds." />
        <Legend color="text-rose-400" label="lossy" desc="Information dropped; declared explicitly on export." />
      </div>

      <WaterQualityDocs />

      <OpenSwmmContext compact />
    </div>
  );
}

function WaterQualityDocs() {
  return (
    <section className="mt-10">
      <div className="text-xs font-mono uppercase tracking-widest text-cyan-300">Water quality · v1.0 first-class</div>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight">SWMM5 ↔ SWMM6 water-quality fields</h2>
      <p className="mt-2 max-w-2xl text-[14px] leading-6 text-muted-foreground">
        All seven water-quality sections ship in SXPF v1.0 — not deferred, not feature-flagged. Below is the
        per-section field mapping between the SWMM5 positional <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12.5px]">.inp</code>{" "}
        format and the SWMM6 typed extension. SXPF stores the union; export to either dialect preserves what
        each format can carry and warns on anything it cannot.
      </p>

      <div className="mt-5 space-y-5">
        {WATER_QUALITY_SECTIONS.map(section => {
          const fields = WATER_QUALITY_FIELDS[section] ?? [];
          const row = MAPPING.find(r => r.section === section);
          return (
            <div key={section} className="overflow-hidden rounded-md border border-cyan-500/30 bg-card">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-cyan-500/5 px-3 py-2">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-sm text-foreground">{section}</span>
                  {row && (
                    <span className="font-mono text-[12px] text-muted-foreground">→ {row.target}</span>
                  )}
                </div>
                {row && (
                  <span className={`font-mono text-[10.5px] uppercase tracking-wider ${RT_COLOR[row.roundTrip]}`}>
                    {row.roundTrip}
                  </span>
                )}
              </div>
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="bg-muted/40 text-left text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-1.5 font-medium">Field</th>
                    <th className="px-3 py-1.5 font-medium">Type</th>
                    <th className="px-3 py-1.5 font-medium">SWMM5</th>
                    <th className="px-3 py-1.5 font-medium">SWMM6</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map(f => (
                    <tr key={f.name} className="border-t border-border align-top">
                      <td className="px-3 py-1.5 font-mono text-[12.5px] text-foreground">{f.name}</td>
                      <td className="px-3 py-1.5 font-mono text-[12px] text-foreground/80">{f.type}</td>
                      <td className="px-3 py-1.5 text-[12.5px] text-muted-foreground">{f.swmm5}</td>
                      <td className="px-3 py-1.5 text-[12.5px] text-muted-foreground">{f.swmm6}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ValidationPanel({
  result,
  pending,
  onDismiss,
  onForce,
}: {
  result: { checkedRows: number; issues: Array<{ level: "error" | "warning"; section: string; field: string; message: string }>; ok: boolean };
  pending: "csv" | "json" | null;
  onDismiss: () => void;
  onForce: () => void;
}) {
  const errors = result.issues.filter(i => i.level === "error");
  const warnings = result.issues.filter(i => i.level === "warning");
  const tone = !result.ok
    ? "border-rose-500/40 bg-rose-500/5"
    : warnings.length > 0
      ? "border-amber-500/40 bg-amber-500/5"
      : "border-emerald-500/40 bg-emerald-500/5";
  const label = !result.ok ? "failed" : warnings.length > 0 ? "passed with warnings" : "passed";
  const labelColor = !result.ok ? "text-rose-300" : warnings.length > 0 ? "text-amber-300" : "text-emerald-300";
  return (
    <div className={`mt-4 rounded-md border p-3 ${tone}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`font-mono text-[10.5px] uppercase tracking-wider ${labelColor}`}>validation · {label}</span>
          <span className="text-muted-foreground">{result.checkedRows} rows · {errors.length} errors · {warnings.length} warnings</span>
        </div>
        <div className="flex items-center gap-2">
          {pending && (
            <button
              onClick={onForce}
              className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider text-rose-200 hover:bg-rose-500/20"
            >
              Export {pending} anyway
            </button>
          )}
          <button
            onClick={onDismiss}
            className="rounded-md border border-border bg-card px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            dismiss
          </button>
        </div>
      </div>
      {result.issues.length > 0 && (
        <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto pr-1">
          {result.issues.map((i, idx) => (
            <li key={idx} className="grid grid-cols-[70px_140px_1fr] gap-2 text-[12px]">
              <span className={`font-mono text-[10px] uppercase tracking-wider ${i.level === "error" ? "text-rose-300" : "text-amber-300"}`}>
                {i.level}
              </span>
              <span className="font-mono text-foreground/80">{i.section}</span>
              <span className="text-muted-foreground">
                <span className="font-mono text-foreground/70">{i.field}</span> — {i.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


function Legend({ color, label, desc }: { color: string; label: string; desc: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className={`font-mono text-[11px] uppercase tracking-wider ${color}`}>{label}</div>
      <div className="mt-1 text-xs text-muted-foreground">{desc}</div>
    </div>
  );
}

function ProvenanceDrawer({
  row,
  prov,
  onClose,
}: {
  row: MappingRow;
  prov: {
    source_dialect: Dialect;
    source_dialects: Dialect[];
    original_inp_section: string;
    tool: string;
    tool_version: string;
    tool_commit: string;
    tool_build_date: string;
    spec_revision: string;
    schema_version: string;
  };
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-border bg-card p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10.5px] font-mono uppercase tracking-widest text-muted-foreground">Row provenance</div>
            <h2 className="mt-1 font-mono text-lg text-foreground">{row.section}</h2>
            <div className="mt-0.5 font-mono text-[12px] text-muted-foreground">{row.target}</div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-border px-2 py-1 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            close
          </button>
        </div>

        <dl className="mt-6 space-y-3 text-sm">
          <Field label="Source dialect" value={prov.source_dialect} />
          <Field label="Source dialects (available)" value={prov.source_dialects.join(" · ")} />
          <Field label="Original .inp section" value={prov.original_inp_section} mono />
          <Field label="Generation tool" value={`${prov.tool}@${prov.tool_version}`} mono />
          <Field label="Tool commit" value={prov.tool_commit} mono />
          <Field label="Tool build date" value={prov.tool_build_date} mono />
          <Field label="Mapping spec revision" value={prov.spec_revision} mono />
          <Field label="SWMM-X schema version" value={`v${prov.schema_version}`} mono />
        </dl>

        <pre className="mt-6 overflow-x-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
{JSON.stringify(prov, null, 2)}
        </pre>
      </aside>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border/60 pb-2">
      <dt className="text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-[13px] text-foreground" : "text-[13px] text-foreground"}>{value}</dd>
    </div>
  );
}

