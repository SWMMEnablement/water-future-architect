import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { MAPPING, KIND_COLOR, RT_COLOR, type MappingRow } from "../lib/inp-mapping";

export const Route = createFileRoute("/mapping")({
  head: () => ({
    meta: [
      { title: ".inp ↔ SWMM-X Mapping — SWMM-X Docs" },
      { name: "description", content: "Section-by-section mapping from EPA-SWMM5 .inp to the SWMM-X (SXPF) project format." },
    ],
  }),
  component: MappingPage,
});

const KINDS: Array<MappingRow["kind"] | "all"> = [
  "all", "topology", "forcings", "scenarios", "manifest", "controls", "quality", "ui", "passthrough",
];

function MappingPage() {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<MappingRow["kind"] | "all">("all");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return MAPPING.filter(r => {
      if (kind !== "all" && r.kind !== kind) return false;
      if (!needle) return true;
      return (
        r.section.toLowerCase().includes(needle) ||
        r.target.toLowerCase().includes(needle) ||
        r.notes.toLowerCase().includes(needle)
      );
    });
  }, [q, kind]);

  const download = (kind: "csv" | "json") => {
    const stamp = new Date().toISOString().slice(0, 10);
    let blob: Blob;
    let filename: string;
    if (kind === "json") {
      blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
      filename = `swmmx-inp-mapping-${stamp}.json`;
    } else {
      const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
      const header = ["section", "target", "kind", "round_trip", "notes"];
      const lines = [
        header.join(","),
        ...rows.map(r => [r.section, r.target, r.kind, r.roundTrip, r.notes].map(esc).join(",")),
      ];
      blob = new Blob([lines.join("\n")], { type: "text/csv" });
      filename = `swmmx-inp-mapping-${stamp}.csv`;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-5xl">
      <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Spec 1</div>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">.inp ↔ SWMM-X mapping</h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-7 text-muted-foreground">
        Every EPA-SWMM5 <code className="rounded bg-muted px-1 py-0.5 font-mono text-[13px]">.inp</code> section
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

      <div className="mt-2 text-xs text-muted-foreground">
        {rows.length} of {MAPPING.length} rows
      </div>

      <div className="mt-4 overflow-hidden rounded-md border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/40 text-left text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 font-medium">.inp section</th>
              <th className="px-3 py-2 font-medium">SXPF target</th>
              <th className="px-3 py-2 font-medium">Kind</th>
              <th className="px-3 py-2 font-medium">Round-trip</th>
              <th className="px-3 py-2 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.section + i} className="border-t border-border align-top hover:bg-accent/30">
                <td className="px-3 py-2.5 font-mono text-[12.5px] text-foreground">{r.section}</td>
                <td className="px-3 py-2.5 font-mono text-[12.5px] text-foreground/80">{r.target}</td>
                <td className="px-3 py-2.5">
                  <span className={`inline-block rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${KIND_COLOR[r.kind]}`}>
                    {r.kind}
                  </span>
                </td>
                <td className={`px-3 py-2.5 font-mono text-[11px] uppercase tracking-wider ${RT_COLOR[r.roundTrip]}`}>
                  {r.roundTrip}
                </td>
                <td className="px-3 py-2.5 text-[13px] text-muted-foreground">{r.notes || "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-10 text-center text-sm text-muted-foreground">No rows match.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Legend color="text-emerald-400" label="lossless" desc="Bit-identical re-export of mapped content." />
        <Legend color="text-amber-400" label="semantic" desc="Reformatting or section merge; AST equality holds." />
        <Legend color="text-rose-400" label="lossy" desc="Information dropped; declared explicitly on export." />
      </div>
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
