// ---------------------------------------------------------------------------
// Artifact: SXPF JSON Schema + Parquet layout viewer
//   Engine   · TanStack Start route rendering JSON_SCHEMAS / PARQUET_LIST from src/lib/sxpf-schemas.ts
//   Concept  · Browsable spec surface for SXPF v1 typed artifacts (topology, forcings, scenarios, WQ)
//   Reusable · JSON_SCHEMAS registry pattern — one source of truth for schema docs + validation
// ---------------------------------------------------------------------------
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  JSON_SCHEMAS,
  PARQUET_LIST,
  CANONICAL_UNITS,
  CANONICAL_CRS,
  CANONICAL_TIMESTAMPS,
  FOREIGN_KEYS,
  SXPF_SCHEMA_VERSION,
  SXPF_BUNDLE_REVISION,
  buildCanonicalBundle,
} from "../lib/sxpf-schemas";
import { OpenSwmmContext } from "@/components/openswmm-context";

export const Route = createFileRoute("/schemas")({
  head: () => ({
    meta: [
      { title: "SXPF Schemas — SWMM-X Docs" },
      { name: "description", content: "Interactive viewer for the SWMM-X v1 JSON Schema and results Parquet layout." },
    ],
  }),
  component: SchemasPage,
});

type Tab = "json" | "parquet" | "canonical";

function downloadBlob(filename: string, mime: string, data: string) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function SchemasPage() {
  const [tab, setTab] = useState<Tab>("canonical");
  const jsonKeys = Object.keys(JSON_SCHEMAS);
  const [activeJson, setActiveJson] = useState<string>(jsonKeys[0]);
  const [activeTable, setActiveTable] = useState<string>(PARQUET_LIST[0].name);
  const bundle = useMemo(() => buildCanonicalBundle(), []);

  const downloadBundle = () =>
    downloadBlob(`sxpf-canonical-${SXPF_SCHEMA_VERSION}-${SXPF_BUNDLE_REVISION}.json`,
      "application/json", JSON.stringify(bundle, null, 2));
  const downloadOne = (key: string) =>
    downloadBlob(key, "application/schema+json", JSON.stringify(JSON_SCHEMAS[key], null, 2));
  const downloadFkCsv = () => {
    const header = "from,to,on_missing,cascade,note";
    const rows = FOREIGN_KEYS.map(fk => [fk.from, fk.to, fk.onMissing, fk.cascade, (fk.note ?? "").replace(/,/g, ";")].join(","));
    downloadBlob("sxpf-foreign-keys.csv", "text/csv", [header, ...rows].join("\n"));
  };


  return (
    <div className="max-w-5xl">
      <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Spec 2 + 3 + Canonical bundle</div>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Schema viewer</h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-7 text-muted-foreground">
        Three surfaces that pin SXPF v1: the canonical bundle (units, CRS, timestamps, FK rules)
        that every component validates against, the JSON Schemas for the project descriptor, and
        the Arrow / Parquet layout for the results analytics tables.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-4 py-3">
        <div className="mr-3">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Canonical bundle</div>
          <div className="font-mono text-[12.5px]">
            sxpf <b>{SXPF_SCHEMA_VERSION}</b> · rev <b>{SXPF_BUNDLE_REVISION}</b>
          </div>
        </div>
        <button onClick={downloadBundle} className="rounded-md border border-foreground/30 bg-accent px-3 py-1.5 text-sm hover:bg-accent/80">
          Download bundle (JSON)
        </button>
        <button onClick={downloadFkCsv} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent/60">
          Download FK rules (CSV)
        </button>
        <span className="ml-auto text-[11px] text-muted-foreground">
          Publish target: <span className="font-mono">{bundle.$id}</span>
        </span>
      </div>

      <div className="mt-6 inline-flex rounded-md border border-border bg-card p-1">
        <TabButton active={tab === "canonical"} onClick={() => setTab("canonical")}>Canonical bundle</TabButton>
        <TabButton active={tab === "json"} onClick={() => setTab("json")}>JSON Schema</TabButton>
        <TabButton active={tab === "parquet"} onClick={() => setTab("parquet")}>Parquet layout</TabButton>
      </div>

      {tab === "canonical" ? (
        <div className="mt-6 space-y-4">
          <section className="rounded-md border border-border bg-card p-4">
            <SectionTitle>Units — canonical (storage) vs allowed display</SectionTitle>
            <div className="mt-3 overflow-hidden rounded-md border border-border">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/40 text-left text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Dimension</th>
                    <th className="px-3 py-2 font-medium">Storage unit</th>
                    <th className="px-3 py-2 font-medium">Allowed display</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(CANONICAL_UNITS.dimensions).map(([dim, spec]) => {
                    const s = spec as { unit: string; allowedDisplay?: string[]; timestamp?: string };
                    return (
                      <tr key={dim} className="border-t border-border">
                        <td className="px-3 py-2 font-mono text-[12.5px]">{dim}</td>
                        <td className="px-3 py-2 font-mono text-[12.5px]">{s.unit}</td>
                        <td className="px-3 py-2 font-mono text-[12px] text-muted-foreground">
                          {(s.allowedDisplay ?? []).join(", ") || (s.timestamp ?? "—")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[12.5px] text-muted-foreground">
              {CANONICAL_UNITS.note}
            </p>
          </section>

          <section className="rounded-md border border-border bg-card p-4">
            <SectionTitle>CRS &amp; geometry</SectionTitle>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Meta label="Projected column" value={`${CANONICAL_CRS.required.projected.column} · ${CANONICAL_CRS.required.projected.encoding}`} />
              <Meta label="Geographic column" value={`${CANONICAL_CRS.required.geographic.column} · ${CANONICAL_CRS.required.geographic.crs}`} />
              <Meta label="Storage rule" value={CANONICAL_CRS.storage} />
              <Meta label="Vertical datum" value={`${CANONICAL_CRS.vertical.datum} (${CANONICAL_CRS.vertical.unit})`} />
            </div>
          </section>

          <section className="rounded-md border border-border bg-card p-4">
            <SectionTitle>Timestamps</SectionTitle>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Meta label="Wire type" value={CANONICAL_TIMESTAMPS.wireType} />
              <Meta label="Encoding" value={CANONICAL_TIMESTAMPS.encoding} />
              <Meta label="Timezone" value={CANONICAL_TIMESTAMPS.timezone} />
              <Meta label="Simulation clock anchor" value={CANONICAL_TIMESTAMPS.simulationClock.anchor} />
              <Meta label="Event windows" value={CANONICAL_TIMESTAMPS.eventWindows} />
            </div>
          </section>

          <section className="rounded-md border border-border bg-card p-4">
            <SectionTitle>Foreign-key rules</SectionTitle>
            <div className="mt-3 overflow-hidden rounded-md border border-border">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/40 text-left text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2 font-medium">From (child)</th>
                    <th className="px-3 py-2 font-medium">To (parent)</th>
                    <th className="px-3 py-2 font-medium">On missing</th>
                    <th className="px-3 py-2 font-medium">Cascade</th>
                    <th className="px-3 py-2 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {FOREIGN_KEYS.map(fk => (
                    <tr key={fk.from + fk.to} className="border-t border-border align-top">
                      <td className="px-3 py-2 font-mono text-[12px]">{fk.from}</td>
                      <td className="px-3 py-2 font-mono text-[12px]">{fk.to}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${
                          fk.onMissing === "reject"
                            ? "border-red-500/30 bg-red-500/15 text-red-300"
                            : "border-amber-500/30 bg-amber-500/15 text-amber-300"
                        }`}>{fk.onMissing}</span>
                      </td>
                      <td className="px-3 py-2 font-mono text-[12px]">{fk.cascade}</td>
                      <td className="px-3 py-2 text-[12.5px] text-muted-foreground">{fk.note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : tab === "json" ? (
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-[220px_1fr]">
          <div className="space-y-1">
            {jsonKeys.map(k => (
              <button
                key={k}
                onClick={() => setActiveJson(k)}
                className={`block w-full rounded-md border px-3 py-2 text-left font-mono text-[12px] ${
                  activeJson === k
                    ? "border-foreground/40 bg-accent text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {k}
              </button>
            ))}
          </div>
          <div className="overflow-hidden rounded-md border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-3 py-2 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              <span>schemas/sxpf/1.0/{activeJson}</span>
              <div className="flex items-center gap-3">
                <span>draft 2020-12</span>
                <button
                  onClick={() => downloadOne(activeJson)}
                  className="rounded border border-border px-2 py-0.5 text-[11px] normal-case tracking-normal text-foreground hover:bg-accent"
                >
                  Download
                </button>
              </div>
            </div>
            <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-6 text-foreground/90">
              {JSON.stringify(JSON_SCHEMAS[activeJson], null, 2)}
            </pre>
          </div>

        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <div className="flex flex-wrap gap-1.5">
            {PARQUET_LIST.map(t => (
              <button
                key={t.name}
                onClick={() => setActiveTable(t.name)}
                className={`rounded-md border px-3 py-1.5 font-mono text-[12px] ${
                  activeTable === t.name
                    ? "border-foreground/40 bg-accent text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>

          {PARQUET_LIST.filter(t => t.name === activeTable).map(t => (
            <div key={t.name} className="space-y-4">
              <div className="rounded-md border border-border bg-card p-4">
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Purpose</div>
                <div className="mt-1 text-sm">{t.purpose}</div>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Meta label="Partition (Hive)" value={t.partition.map(p => `${p}=…`).join(" / ")} />
                  <Meta label="Sort within file" value={t.sortWithinFile} />
                </div>
              </div>

              <div className="overflow-hidden rounded-md border border-border">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-muted/40 text-left text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Column</th>
                      <th className="px-3 py-2 font-medium">Arrow type</th>
                      <th className="px-3 py-2 font-medium">Encoding / notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.fields.map(f => (
                      <tr key={f.name} className="border-t border-border align-top">
                        <td className="px-3 py-2 font-mono text-[12.5px]">{f.name}</td>
                        <td className="px-3 py-2 font-mono text-[12.5px] text-foreground/80">{f.type}</td>
                        <td className="px-3 py-2 text-[13px] text-muted-foreground">
                          {f.dict ? <span className="mr-2 rounded border border-blue-500/30 bg-blue-500/15 px-1.5 py-0.5 font-mono text-[10px] uppercase text-blue-300">dict</span> : null}
                          {f.notes || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-md border border-border bg-card p-4">
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">On-disk layout</div>
                <pre className="mt-2 overflow-x-auto font-mono text-[12.5px] leading-6 text-foreground/90">
{`runs/<run-hash>/parquet/${t.name}/
${t.partition.map((p, i) => "  ".repeat(i) + p + "=<value>/").join("\n")}
${"  ".repeat(t.partition.length)}part-0000.parquet     ~128 MB, zstd-3
${"  ".repeat(t.partition.length)}part-0001.parquet`}
                </pre>
              </div>
            </div>
          ))}

          <div className="rounded-md border border-border bg-card p-4">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Reference query · DuckDB</div>
            <pre className="mt-2 overflow-x-auto font-mono text-[12.5px] leading-6 text-foreground/90">
{`-- Peak flooding nodes for one scenario
SELECT element_id, MAX(value) AS peak
FROM read_parquet(
  'runs/*/parquet/timeseries_node/scenario_id=climate-2050-rcp85/variable=flooding/**/*.parquet'
)
GROUP BY element_id
ORDER BY peak DESC
LIMIT 20;`}
            </pre>
          </div>
        </div>
      )}

      <OpenSwmmContext compact />
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-3 py-1.5 text-sm transition-colors ${
        active ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-[12.5px]">{value}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{children}</div>;
}

