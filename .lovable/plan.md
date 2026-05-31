# SWMM-X Project Format (SXPF v1)

A versioned, columnar, git-friendly project format that replaces `.inp` as the source of truth while remaining round-trippable with it.

## Design goals

1. **Diffable** — text manifests + stable IDs + sorted columnar files so `git diff` and 3-way merge work on real models (100k+ nodes).
2. **Queryable** — open standards (GeoParquet, Arrow, JSON-LD, Zarr) so DuckDB / Spark / QGIS / Python read it with zero custom drivers.
3. **Backward-compatible** — lossless `.inp` ↔ SXPF conversion, with `.inp` treated as an *export*, not the source.
4. **Versioned** — semver on the schema, content-addressed snapshots on the data, explicit migration path.

---

## 1. Repository layout

A SWMM-X project is a directory (or zip with `.sxpf` extension):

```text
my-city.sxpf/
  manifest.yaml                 # schema version, project meta, CRS, units
  topology/                     # the network — diffable
    nodes.parquet               # GeoParquet, sorted by id
    links.parquet
    subcatchments.parquet
    controls/                   # one YAML per RTC rule (diffable)
      pump-station-7.rule.yaml
    curves/                     # one Parquet per curve, named by id
      pump-curve-A.parquet
    patterns/
      dry-weather.parquet
  scenarios/
    _base.scenario.yaml         # parameter overlays, not full copies
    climate-2050-rcp85.scenario.yaml
    gi-buildout-v3.scenario.yaml
  ensembles/
    monte-carlo-2026q1.ensemble.yaml   # references scenarios + seeds
  runs/                         # gitignored by default; content-addressed
    <run-hash>/
      run.json                  # inputs, solver version, provenance
      results.zarr/             # time-series cube (time × element × var)
      summary.parquet
      events.parquet
  exports/
    legacy.inp                  # generated; never edited by hand
  .sxpf/
    lockfile.json               # pinned solver + schema versions
    migrations.log
```

Rule: **anything a human edits is text or sorted columnar**; anything a machine produces lives under `runs/` and is content-addressed.

---

## 2. Manifest (`manifest.yaml`)

```yaml
sxpf: 1.0                       # schema major.minor
project:
  id: urn:swmm:city-of-x:main
  name: City of X — Combined Sewer
  crs: EPSG:2263
  units: { length: ft, flow: cfs, time: s }
solver:
  kernel: swmm-x
  version: ">=6.0,<7"
  features: [dynwave, gpu, quality]
provenance:
  created_by: jane@city-of-x.gov
  created_at: 2026-05-31T12:00:00Z
  source_inp: legacy/2024-10-01.inp     # if migrated
```

`sxpf` version uses semver: minor = additive, major = breaking. Readers MUST refuse unknown major versions; writers MUST emit the lowest version that supports all features used.

---

## 3. Topology schema (GeoParquet)

One file per element class. Every row has a **stable string `id`** (the merge key) and an **integer `revision`** (monotonic per element). Files are sorted by `id` so git diff is stable and parquet row-group pruning works.

### `nodes.parquet`

| column | type | notes |
|---|---|---|
| `id` | string | stable, matches `.inp` name |
| `kind` | enum | junction \| outfall \| storage \| divider |
| `geom` | geometry(Point) | GeoParquet 1.1 |
| `invert_elev` | float64 | |
| `max_depth` | float64 | |
| `init_depth` | float64 | |
| `surcharge_depth` | float64 | |
| `ponded_area` | float64 | |
| `attrs` | struct | kind-specific (storage curve ref, outfall stage, …) |
| `tags` | list<string> | user labels |
| `revision` | int64 | bumped on edit |
| `last_modified` | timestamp | |

Same pattern for `links.parquet` (conduits, pumps, orifices, weirs, outlets — discriminated by `kind`) and `subcatchments.parquet`.

References between files are **by `id` string**, never by row index. This is what makes 3-way merges safe.

### Curves, patterns, controls

- Curves and patterns are one file per object (`curves/<id>.parquet`) so a change to one curve is a one-file diff, not a giant blob.
- RTC controls are YAML, one rule per file, because rules are read by humans and reviewed in PRs.

---

## 4. Scenario model (overlays, not copies)

A scenario is a **typed patch** over the base topology + a set of forcings. Never copy the full network.

```yaml
# scenarios/climate-2050-rcp85.scenario.yaml
id: climate-2050-rcp85
extends: _base
forcings:
  rainfall:
    source: parquet://forcings/noaa-atlas14-rcp85.parquet
    perturbation: { method: quantile-map, ref: historical-1990-2020 }
  boundary:
    outfall_OF1: { source: parquet://forcings/tide-2050.parquet }
overrides:
  - target: subcatchments
    where: "land_use == 'residential'"
    set: { pct_impervious: { op: multiply, value: 1.15 } }
  - target: links
    where: "kind == 'conduit' and id in @rehab_list_2030"
    set: { roughness: 0.013 }
parameters:
  - name: gi_adoption
    distribution: { type: uniform, low: 0.0, high: 0.4 }
solver_overrides:
  routing_step: 5s
```

Why this shape:
- `extends` makes scenario inheritance explicit (climate × GI buildout × rehab plan).
- `overrides` are **declarative predicates**, not row-level copies — they survive topology edits.
- `parameters` declare uncertainty; ensembles sample them.

### Ensembles

```yaml
# ensembles/monte-carlo-2026q1.ensemble.yaml
id: mc-2026q1
scenarios: [climate-2050-rcp85, gi-buildout-v3]
samples: 10000
sampler: { type: sobol, seed: 42 }
outputs:
  retain: [summary, events, peaks]
  drop: [full-timeseries]              # cost control
```

---

## 5. Results schema (Zarr + Parquet)

Results are **content-addressed by `hash(topology + scenario + solver_version + forcings)`** so identical inputs never re-run, and any chart can be traced back to an exact run.

### `results.zarr/` — the time-series cube

A 3-D chunked array per variable group:

```
results.zarr/
  node/
    depth          dims: (time, node_id)        chunk: (1h, 4096)
    head
    inflow
    flooding
  link/
    flow           dims: (time, link_id)
    velocity
    capacity
  subcatchment/
    runoff
    infiltration
  quality/
    <pollutant>/   dims: (time, node_id)
  coords/
    time           int64, unix seconds
    node_id        string
    link_id        string
```

Why Zarr: cloud-native (S3 range reads), chunked on both axes so "all variables at one node" and "one variable across the network at one timestep" are both fast. Compression: `zstd` + `blosc` shuffle.

### `summary.parquet` — one row per element

Peaks, totals, mass balance, continuity errors. This is what 95% of dashboards read; keep it small and Parquet so DuckDB queries are instant.

### `events.parquet` — discrete events

Floods, overflows, pump starts/stops, RTC firings, with `(start, end, element_id, kind, magnitude)`. Drives reporting without scanning the full cube.

### `run.json` — provenance

```json
{
  "run_id": "sha256:…",
  "topology_hash": "sha256:…",
  "scenario_id": "climate-2050-rcp85",
  "scenario_hash": "sha256:…",
  "solver": { "kernel": "swmm-x", "version": "6.0.2", "build": "…" },
  "started": "…", "finished": "…",
  "host": "worker-7", "gpu": "A100",
  "continuity_error": { "flow": 0.21, "quality": 0.05 }
}
```

---

## 6. Backward compatibility with `.inp`

Two-way bridge, lossless in the round-trip sense that matters:

- **`.inp` → SXPF (import)**: deterministic. Every `.inp` section maps to a typed table. Unknown / vendor sections preserved verbatim in `topology/_passthrough/<section>.txt` with a `provenance` marker.
- **SXPF → `.inp` (export)**: regenerates `exports/legacy.inp` on demand for EPA-SWMM5, InfoSWMM, XPSWMM, ICM. Feature-flag any SXPF concept the target can't express (e.g. ensembles, declarative overrides) — exporter warns instead of silently dropping.
- **Conformance suite**: every EPA-SWMM5 test case ships as a golden `.inp` + its imported SXPF + its expected results. CI fails on any drift.
- **`swmm-x diff a.inp b.inp`** works by importing both sides to SXPF and diffing the typed tables — meaningful diffs instead of line-by-line text noise.

---

## 7. Versioning and migration

- **Schema semver** in `manifest.sxpf`. Major bumps ship a `migrations/<from>-to-<to>.py` that runs in-place; `sxpf migrate` is idempotent and logs to `.sxpf/migrations.log`.
- **Element revisions** (`revision` column) let the UI show "what changed since last run" without a full diff.
- **Solver version pinning** in `lockfile.json` — opening a project in a newer kernel doesn't silently change results; user must re-pin.
- **Content-addressed runs** mean old results stay valid forever; they're just labeled with the old `topology_hash`.

---

## 8. Why these choices

| Decision | Why |
|---|---|
| Parquet + GeoParquet for topology | Columnar, sorted, typed → meaningful git diffs at 100k-element scale; DuckDB / QGIS read natively. |
| One file per curve / control rule | Single-rule edits = single-file diff; reviewable in PRs. |
| Stable string IDs as merge keys | Safe 3-way merges; survives reordering and renumbering. |
| Scenarios as declarative overlays | Composable (climate × GI × rehab); survives topology edits; cheap to store 10k of them. |
| Zarr for the results cube | Cloud-native chunked reads; same file serves dashboards, notebooks, and ML pipelines. |
| Content-addressed runs | Reproducibility, dedupe, and clean cache eviction. |
| `.inp` as export, not source | Frees the data model from a 1990s text format while keeping every existing tool working. |

---

## Open questions for you

1. **Geometry precision**: store as float64 lon/lat in a single CRS, or keep native project CRS? (Affects diff stability across reprojection.)
2. **Quality model scope in v1**: full EPA-SWMM5 parity, or land it in v1.1 behind a feature flag?
3. **RTC rules**: keep EPA's `IF/THEN/ELSE` text grammar, or move to a typed AST in YAML now (breaking) vs later (migration)?
4. **Binary `.out` compatibility**: emit legacy `.out` alongside Zarr for tools that read it, or hard-cut?

Answers shape the v1.0 freeze.
