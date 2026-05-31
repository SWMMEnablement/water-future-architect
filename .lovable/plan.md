# SWMM-X v1 Schemas: .inp Bridge, Results Parquet, JSON Schema

Three concrete specs that turn the SXPF v1 design into something a team can implement and test against this quarter.

---

## 1. `.inp` ↔ SXPF backward-compatibility mapping

Goal: every EPA-SWMM5 `.inp` and every SWMM6 dialect imports losslessly into SXPF, and `sxpf export --target swmm5` regenerates a byte-equivalent `.inp` (modulo whitespace and comment ordering, which are preserved out-of-band).

### 1.1 Mapping rules

- **One `.inp` section → one typed target.** Either a column in a topology table, a row in a controlled vocab, or a sidecar object.
- **Stable IDs.** `.inp` element names become SXPF `id` verbatim (case-preserved). Collisions across element kinds (legal in SWMM5) get suffixed `:node`, `:link` and the original name kept in `legacy_name`.
- **Units.** `.inp` `[OPTIONS] FLOW_UNITS` sets `manifest.project.units`; values are stored in project units, never silently converted.
- **Unknown sections.** Anything not in the mapping table lands in `topology/_passthrough/<SECTION>.txt` with original line order + a `provenance.source_line` index. Export writes it back verbatim.
- **Comments / blank lines.** Captured in `.sxpf/inp_trivia.json` keyed by `(section, anchor_id)` so export reproduces them.
- **Vendor dialects** (InfoSWMM, XPSWMM, ICM, SWMM6 extensions) are handled by named *profiles* (`profile: epa-swmm5 | infoswmm | xpswmm | icm | swmm6`); a profile is just an ordered list of section handlers + a passthrough policy.

### 1.2 Section → SXPF target table (excerpt)

```text
.inp section          SXPF target                       Notes
--------------------  --------------------------------  ----------------------------------
[TITLE]               manifest.project.name + notes     Multi-line preserved in notes
[OPTIONS]             manifest.solver + solver_defaults Typed; unknown keys → solver.extras
[EVAPORATION]         forcings/evaporation.parquet      Series or monthly
[TEMPERATURE]         forcings/temperature.parquet      Series + wind + snowmelt block
[RAINGAGES]           topology/raingages.parquet        FK to forcings/rainfall/<id>
[SUBCATCHMENTS]       topology/subcatchments.parquet    + [SUBAREAS],[INFILTRATION] merged
[JUNCTIONS]           topology/nodes.parquet kind=junction
[OUTFALLS]            topology/nodes.parquet kind=outfall
[STORAGE]             topology/nodes.parquet kind=storage  + curve ref
[DIVIDERS]            topology/nodes.parquet kind=divider
[CONDUITS]            topology/links.parquet kind=conduit  + [XSECTIONS],[LOSSES] merged
[PUMPS]/[ORIFICES]/   topology/links.parquet kind=...
 [WEIRS]/[OUTLETS]
[CONTROLS]            topology/controls/<rule>.rule.yaml   Parsed AST + original_text
[CURVES]              topology/curves/<id>.parquet
[TIMESERIES]          forcings/series/<id>.parquet
[PATTERNS]            topology/patterns/<id>.parquet
[POLLUTANTS]/[LANDUSES]/
 [BUILDUP]/[WASHOFF]/
 [COVERAGES]/[LOADINGS]/
 [TREATMENT]          quality/*.parquet (feature-flag)
[LID_CONTROLS]/[LID_USAGE] topology/lid/*.parquet
[DWF]/[INFLOWS]/[RDII] forcings/inflows.parquet
[REPORT]/[TAGS]/[MAP]/
 [COORDINATES]/[VERTICES]/
 [POLYGONS]/[SYMBOLS]/
 [LABELS]/[BACKDROP]/
 [PROFILES]            UI/view sidecar: views/*.yaml + geom merged into topology
[ADJUSTMENTS]         scenarios/_base overrides
[HYDROGRAPHS]         forcings/hydrographs/<id>.parquet
[EVENTS]              scenarios/_base.events
```

Full mapping (≈40 sections) lives in `docs/inp-mapping.md` with one row per `.inp` keyword.

### 1.3 Round-trip contract

- **Lossless set.** Mapped sections + passthrough + trivia → bit-identical re-export.
- **Lossy set.** Declared explicitly: floating-point reformatting (`%.6g`), reordering inside sections that SWMM5 treats as unordered, comment re-flow. CI golden tests assert *semantic* equality (parse → AST equal), not byte equality, for these.
- **Conformance harness.** All EPA-SWMM5 example projects + ~30 customer-donated models run nightly: `inp → sxpf → inp' → run both → diff results`. Continuity error delta must be `< 1e-6`; peak flow delta `< 0.1%`.
- **Provenance.** Every imported row carries `provenance: { source: "legacy.inp", section: "JUNCTIONS", line: 1423, profile: "epa-swmm5" }`.

### 1.4 Forward-only features

SXPF concepts the legacy `.inp` cannot express (ensembles, declarative overrides, typed RTC AST, GeoParquet CRS) are flagged on export:

```text
$ sxpf export --target swmm5
warn: scenario 'climate-2050-rcp85' uses declarative overrides;
      materialized into 412 row edits in legacy.inp.
warn: ensemble 'mc-2026q1' dropped (not representable in EPA-SWMM5).
```

---

## 2. Results Parquet schema + partition strategy

Parallel to the `results.zarr/` cube for time-series, **Parquet is the analytics surface**: what DuckDB / Spark / Athena / BI tools hit. Same data, different shape, generated together.

### 2.1 Tables

Four tables under `runs/<run-hash>/parquet/`:

```text
parquet/
  timeseries_node/
  timeseries_link/
  timeseries_subcatchment/
  summary/
  events/
```

#### `timeseries_node` (and `_link`, `_subcatchment`)

Long-format (one row per element × time × variable), not wide. Long format is what every query engine wants and what aligns with the partition strategy.

| column | type | notes |
|---|---|---|
| `run_id` | string | denormalized for cross-run queries |
| `scenario_id` | string | denormalized |
| `element_id` | dict<string> | dictionary-encoded; high cardinality but repeats |
| `variable` | dict<string> | `depth`,`head`,`inflow`,`flooding`,... |
| `ts` | timestamp(ms, UTC) | |
| `value` | float32 | float32 is enough for hydraulics; halves storage vs float64 |
| `quality` | uint8 | bitfield: surcharged, flooded, dry, interpolated, assimilated |

Sort order within each file: `(element_id, ts)` — enables predicate pushdown for "all variables for node X" and efficient run-length on `element_id`.

#### `summary` — one row per (run, element)

`run_id, scenario_id, element_kind, element_id, peak_value, peak_time, total_volume, hours_flooded, hours_surcharged, mass_balance_error, ...`. Float64 here (small table, precision matters for QA).

#### `events` — discrete events

`run_id, scenario_id, element_id, kind, start_ts, end_ts, duration_s, magnitude, peak_value, peak_time, attrs (struct)`. `kind ∈ {flood, overflow, surcharge, pump_start, pump_stop, rtc_fire, dry_weather_violation}`.

### 2.2 Partitioning

Hive-style, designed so the 95th-percentile query touches one or two partitions.

```text
parquet/timeseries_node/
  scenario_id=climate-2050-rcp85/
    variable=depth/
      ts_day=2050-08-14/
        part-0000.parquet     ~128 MB target, zstd-3
        part-0001.parquet
```

- **L1 `scenario_id`** — most queries scope to one scenario or ensemble member.
- **L2 `variable`** — column-store benefit is lost in long format unless we partition by it; this restores it.
- **L3 `ts_day`** — daily partitions for sub-hourly steps (5 s typical). Falls back to `ts_month` for long continuous simulations (>1 year) via writer config.

Row groups: 1M rows, `(element_id, ts)` sorted, `element_id` dict-encoded, `ts` delta-encoded, `value` byte-stream-split + zstd.

Ensemble runs add a parent partition `ensemble_id=...` and `sample_id` becomes a column (not a partition) to keep cardinality manageable.

`summary` and `events` partition by `scenario_id` only — small enough that finer partitioning hurts.

### 2.3 Why this shape

- **Long-format + partition-by-variable** keeps "node depth across the city for one hour" *and* "one node, all variables, all time" both fast — the two dominant query patterns.
- **Float32** halves storage at ~0.1% precision loss, dwarfed by solver tolerance.
- **Denormalized `run_id`/`scenario_id`** lets analysts query across runs without a join (`SELECT … WHERE scenario_id IN (...)`); the run manifest in `runs/<hash>/run.json` is the join key when needed.
- **Same data as Zarr, different layout.** Writer emits both in one pass; Zarr for "give me a numpy cube", Parquet for "give me a SQL answer". No drift because they share a single source-of-truth in-memory buffer.

### 2.4 Reference queries (DuckDB)

```sql
-- Peak flooding nodes for one scenario
SELECT element_id, MAX(value) peak
FROM read_parquet('runs/*/parquet/timeseries_node/scenario_id=climate-2050-rcp85/variable=flooding/**/*.parquet')
GROUP BY element_id ORDER BY peak DESC LIMIT 20;

-- Event frequency across ensemble
SELECT element_id, COUNT(*) overflows
FROM read_parquet('runs/*/parquet/events/scenario_id=*/**/*.parquet')
WHERE kind='overflow'
GROUP BY element_id;
```

---

## 3. JSON Schema for SXPF v1

Draft 2020-12. Five schema files, one root, all under `schemas/sxpf/1.0/`. Topology and forcings reference the Parquet/GeoParquet *files*; the JSON Schema validates the *metadata and shape*, not the binary payloads. A companion `parquet-schemas/*.json` (Arrow IPC schema JSON) validates column types — kept separate so editors don't choke.

### 3.1 File set

```text
schemas/sxpf/1.0/
  sxpf.schema.json          # root: validates a whole project directory descriptor
  manifest.schema.json      # manifest.yaml
  scenario.schema.json      # scenarios/*.scenario.yaml
  ensemble.schema.json      # ensembles/*.ensemble.yaml
  control-rule.schema.json  # topology/controls/*.rule.yaml
  run.schema.json           # runs/<hash>/run.json
parquet-schemas/1.0/
  nodes.arrow.json
  links.arrow.json
  subcatchments.arrow.json
  timeseries.arrow.json
  summary.arrow.json
  events.arrow.json
```

### 3.2 Root (`sxpf.schema.json`) — sketch

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://swmm-x.org/schemas/sxpf/1.0/sxpf.schema.json",
  "title": "SWMM-X Project",
  "type": "object",
  "required": ["sxpf", "manifest", "topology"],
  "properties": {
    "sxpf": { "$ref": "#/$defs/semver_pin" },
    "manifest": { "$ref": "manifest.schema.json" },
    "topology": {
      "type": "object",
      "required": ["nodes", "links", "subcatchments"],
      "properties": {
        "nodes":         { "$ref": "#/$defs/parquet_ref" },
        "links":         { "$ref": "#/$defs/parquet_ref" },
        "subcatchments": { "$ref": "#/$defs/parquet_ref" },
        "curves":   { "type": "array", "items": { "$ref": "#/$defs/parquet_ref" } },
        "patterns": { "type": "array", "items": { "$ref": "#/$defs/parquet_ref" } },
        "controls": { "type": "array", "items": { "$ref": "control-rule.schema.json" } }
      }
    },
    "scenarios": { "type": "array", "items": { "$ref": "scenario.schema.json" } },
    "ensembles": { "type": "array", "items": { "$ref": "ensemble.schema.json" } },
    "runs":      { "type": "array", "items": { "$ref": "run.schema.json" } }
  },
  "$defs": {
    "semver_pin": { "type": "string", "pattern": "^[0-9]+\\.[0-9]+(\\.[0-9]+)?$" },
    "parquet_ref": {
      "type": "object", "required": ["path", "sha256", "rows", "arrow_schema"],
      "properties": {
        "path":          { "type": "string" },
        "sha256":        { "type": "string", "pattern": "^[a-f0-9]{64}$" },
        "rows":          { "type": "integer", "minimum": 0 },
        "arrow_schema":  { "type": "string", "description": "ref to parquet-schemas/1.0/<name>" }
      }
    }
  }
}
```

### 3.3 Versioning rules in the schema

Every schema file carries:

```json
{
  "$id": "https://swmm-x.org/schemas/sxpf/1.0/<name>.schema.json",
  "properties": {
    "schema_version":   { "const": "1.0" },
    "min_reader_version": { "type": "string" },
    "writer":             { "type": "object",
      "required": ["name","version"],
      "properties": { "name": {"type":"string"}, "version":{"type":"string"} } }
  },
  "required": ["schema_version"]
}
```

Rules enforced by the validator (not just the schema):

- **Major mismatch**: refuse to load.
- **Minor mismatch (reader < file)**: warn, load read-only.
- **Patch mismatch**: silent.
- **Solver version**: pinned in `manifest.solver.version` as a semver *range*; reader resolves and records the exact build in every `run.json` so results stay reproducible.
- **Migrations**: each `n.x → (n+1).0` ships a script in `migrations/<from>-<to>.py` and a JSON Schema patch in `schemas/sxpf/<to>/changes.json` listing added/removed/renamed fields. `sxpf migrate` is idempotent.

### 3.4 Scenario schema (excerpt)

```json
{
  "$id": "scenario.schema.json",
  "type": "object",
  "required": ["id", "schema_version"],
  "properties": {
    "id":             { "type": "string", "pattern": "^[a-z0-9][a-z0-9._-]*$" },
    "schema_version": { "const": "1.0" },
    "extends":        { "type": "string" },
    "forcings":       { "$ref": "#/$defs/forcings" },
    "overrides": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["target", "set"],
        "properties": {
          "target": { "enum": ["nodes","links","subcatchments","controls"] },
          "where":  { "type": "string", "description": "SQL-like predicate" },
          "set":    { "type": "object", "additionalProperties":
                        { "oneOf": [
                            { "type": ["number","string","boolean","null"] },
                            { "type": "object", "required":["op","value"],
                              "properties": { "op": {"enum":["set","add","multiply","scale_to"]},
                                              "value": {} } } ] } }
        }
      }
    },
    "parameters": {
      "type": "array",
      "items": { "type": "object", "required":["name","distribution"],
        "properties": { "name":{"type":"string"},
          "distribution": { "oneOf":[
            {"properties":{"type":{"const":"uniform"},"low":{"type":"number"},"high":{"type":"number"}}},
            {"properties":{"type":{"const":"normal"},"mean":{"type":"number"},"std":{"type":"number"}}},
            {"properties":{"type":{"const":"lognormal"},"mu":{"type":"number"},"sigma":{"type":"number"}}}
          ]}}}
    },
    "solver_overrides": { "type": "object" }
  }
}
```

### 3.5 Run schema (excerpt)

```json
{
  "$id": "run.schema.json",
  "type": "object",
  "required": ["run_id","topology_hash","scenario_hash","solver","started","finished"],
  "properties": {
    "run_id":        { "type": "string", "pattern": "^sha256:[a-f0-9]{64}$" },
    "topology_hash": { "type": "string", "pattern": "^sha256:[a-f0-9]{64}$" },
    "scenario_id":   { "type": "string" },
    "scenario_hash": { "type": "string" },
    "ensemble":      { "type": "object",
      "properties": { "id":{"type":"string"}, "sample_id":{"type":"integer"} } },
    "solver": { "type":"object", "required":["kernel","version","build"],
      "properties": { "kernel":{"type":"string"}, "version":{"type":"string"},
                      "build":{"type":"string"}, "features":{"type":"array","items":{"type":"string"}} } },
    "started":  { "type":"string","format":"date-time" },
    "finished": { "type":"string","format":"date-time" },
    "host":     { "type":"string" },
    "gpu":      { "type":"string" },
    "continuity_error": { "type":"object",
      "properties": { "flow":{"type":"number"}, "quality":{"type":"number"} } },
    "outputs": { "type":"object",
      "required":["zarr","parquet"],
      "properties": {
        "zarr":    { "$ref":"#/$defs/dataset_ref" },
        "parquet": { "type":"array","items":{ "$ref":"#/$defs/dataset_ref" } }
      } }
  }
}
```

### 3.6 What the schemas deliberately *don't* do

- They don't try to validate Parquet column types — that's `arrow_schema` references + a Parquet-aware validator (e.g. `parquet-tools schema` in CI).
- They don't enforce referential integrity (a `link.from_node` must exist in `nodes.parquet`) — that's a separate `sxpf check` pass using DuckDB. JSON Schema is the wrong tool for cross-file FK validation at 100k-element scale.

---

## Deliverables this lands

1. `docs/inp-mapping.md` — full section-by-section table + profile definitions + golden-file harness spec.
2. `schemas/sxpf/1.0/*.schema.json` + `parquet-schemas/1.0/*.arrow.json` — published with `$id` URLs.
3. `docs/results-parquet.md` — table DDL, partition layout, writer config, reference queries.
4. Reference implementation skeleton: `sxpf-cli` (Rust) with `import`, `export`, `check`, `migrate` subcommands, wired to the conformance harness from day one.

## Open calls for you to make

1. **Quality model in v1 or v1.1?** Drives whether `quality/*.parquet` is in the 1.0 freeze or behind a flag.
2. **Float32 in long-format timeseries** — acceptable, or insist on float64?
3. **`sample_id` as partition vs column** for ensembles — current draft says column; large ensembles (100k samples) may need it promoted to partition.
4. **Control-rule AST**: ship the typed AST in 1.0 (breaking from `.inp` text), or keep both with the AST as the canonical form and `original_text` for round-trip? Current draft says both.
