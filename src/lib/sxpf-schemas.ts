// Inline canonical SXPF v1 schemas + Arrow schemas used by the viewer page.
//
// Canonical bundle metadata — bumped whenever any JSON_SCHEMAS entry, PARQUET_LIST
// table, CANONICAL_UNITS, CANONICAL_CRS, CANONICAL_TIMESTAMPS or FOREIGN_KEYS changes.
export const SXPF_SCHEMA_VERSION = "1.0.0";
export const SXPF_BUNDLE_REVISION = "2026-07-24";
export const SXPF_BUNDLE_ID = "https://swmm-x.org/schemas/sxpf/1.0/bundle.json";

// ---------------------------------------------------------------------------
// Canonical unit system — every numeric field in JSON_SCHEMAS / PARQUET_LIST
// must resolve to one of these. Conversions are pinned so validators agree.
// ---------------------------------------------------------------------------
export const CANONICAL_UNITS = {
  system: "SI-internal",
  note: "Storage is SI. UI/exports can display US customary; the canonical file is SI.",
  dimensions: {
    length: { unit: "m", allowedDisplay: ["m", "ft"] },
    area: { unit: "m2", allowedDisplay: ["m2", "ha", "ac"] },
    volume: { unit: "m3", allowedDisplay: ["m3", "L", "MG"] },
    flow: { unit: "m3/s", allowedDisplay: ["CMS", "LPS", "MLD", "CFS", "GPM", "MGD"] },
    velocity: { unit: "m/s" },
    concentration: { unit: "mg/L", allowedDisplay: ["mg/L", "ug/L", "#/L"] },
    mass: { unit: "kg" },
    time: { unit: "s", timestamp: "ISO-8601 UTC (ms precision)" },
    temperature: { unit: "degC" },
    rainfall_intensity: { unit: "mm/h", allowedDisplay: ["mm/h", "in/h"] },
    slope: { unit: "m/m" },
    manning_n: { unit: "dimensionless" },
  },
} as const;

// ---------------------------------------------------------------------------
// Canonical CRS rules — geometry is stored in a single project CRS; a
// WGS84 geographic column is always present for cross-project queries.
// ---------------------------------------------------------------------------
export const CANONICAL_CRS = {
  storage: "EPSG code or WKT string, pinned per-project in manifest.project.crs",
  required: {
    projected: {
      column: "geom",
      encoding: "GeoParquet 1.1 WKB",
      note: "Project CRS — used for length/area computations.",
    },
    geographic: {
      column: "geom_wgs84",
      encoding: "GeoParquet 1.1 WKB",
      crs: "EPSG:4326",
      note: "Always derived, always present. Enables cross-project spatial joins.",
    },
  },
  vertical: { datum: "orthometric (per manifest.project.vertical_datum)", unit: "m" },
} as const;

// ---------------------------------------------------------------------------
// Canonical timestamp rules — every ts column is UTC ms; simulation clocks
// are anchored to a wall-clock start declared in the run record.
// ---------------------------------------------------------------------------
export const CANONICAL_TIMESTAMPS = {
  wireType: "timestamp[ms, UTC]",
  encoding: "int64 delta-of-delta",
  timezone: "UTC — display TZ lives in manifest.project.display_tz",
  simulationClock: {
    anchor: "run.started (ISO-8601 UTC)",
    resolution_s: "run.solver.report_step_s",
    windowClosedLeftOpenRight: true,
  },
  eventWindows: "start_ts inclusive, end_ts exclusive; duration_s = (end_ts - start_ts)/1000",
} as const;

// ---------------------------------------------------------------------------
// Canonical foreign-key rules — validated at ingest and by the diff tool.
// (parent.column) → (child.column). All keys are string dictionaries.
// ---------------------------------------------------------------------------
export type ForeignKey = {
  from: string;              // "child_table.column"
  to: string;                // "parent_table.column"
  onMissing: "reject" | "warn";
  cascade: "none" | "delete" | "null";
  note?: string;
};

export const FOREIGN_KEYS: ForeignKey[] = [
  { from: "links.from_node", to: "nodes.id", onMissing: "reject", cascade: "none" },
  { from: "links.to_node", to: "nodes.id", onMissing: "reject", cascade: "none" },
  { from: "subcatchments.outlet", to: "nodes.id|subcatchments.id", onMissing: "reject", cascade: "none", note: "outlet may be a node OR another subcatchment" },
  { from: "timeseries_node.element_id", to: "nodes.id", onMissing: "warn", cascade: "none" },
  { from: "timeseries_node.run_id", to: "runs.run_id", onMissing: "reject", cascade: "delete" },
  { from: "summary.element_id", to: "nodes.id|links.id|subcatchments.id", onMissing: "reject", cascade: "none" },
  { from: "events.element_id", to: "nodes.id|links.id", onMissing: "reject", cascade: "none" },
  { from: "quality_landuse.pollutant_id", to: "quality_pollutants.pollutant_id", onMissing: "reject", cascade: "none" },
  { from: "quality_landuse.subcatchment_id", to: "subcatchments.id", onMissing: "warn", cascade: "none" },
  { from: "quality_treatment.node_id", to: "nodes.id", onMissing: "reject", cascade: "none" },
  { from: "quality_treatment.pollutant_id", to: "quality_pollutants.pollutant_id", onMissing: "reject", cascade: "none" },
  { from: "scenarios.extends", to: "scenarios.id", onMissing: "reject", cascade: "none" },
  { from: "runs.scenario_id", to: "scenarios.id", onMissing: "reject", cascade: "none" },
];



export const JSON_SCHEMAS: Record<string, unknown> = {
  "sxpf.schema.json": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://swmm-x.org/schemas/sxpf/1.0/sxpf.schema.json",
    title: "SWMM-X Project",
    type: "object",
    required: ["sxpf", "manifest", "topology"],
    properties: {
      sxpf: { type: "string", pattern: "^[0-9]+\\.[0-9]+(\\.[0-9]+)?$" },
      manifest: { $ref: "manifest.schema.json" },
      topology: {
        type: "object",
        required: ["nodes", "links", "subcatchments"],
        properties: {
          nodes: { $ref: "#/$defs/parquet_ref" },
          links: { $ref: "#/$defs/parquet_ref" },
          subcatchments: { $ref: "#/$defs/parquet_ref" },
          curves: { type: "array", items: { $ref: "#/$defs/parquet_ref" } },
          patterns: { type: "array", items: { $ref: "#/$defs/parquet_ref" } },
          controls: { type: "array", items: { $ref: "control-rule.schema.json" } },
        },
      },
      scenarios: { type: "array", items: { $ref: "scenario.schema.json" } },
      ensembles: { type: "array", items: { $ref: "ensemble.schema.json" } },
      runs: { type: "array", items: { $ref: "run.schema.json" } },
    },
    $defs: {
      parquet_ref: {
        type: "object",
        required: ["path", "sha256", "rows", "arrow_schema"],
        properties: {
          path: { type: "string" },
          sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
          rows: { type: "integer", minimum: 0 },
          arrow_schema: { type: "string" },
        },
      },
    },
  },
  "manifest.schema.json": {
    $id: "manifest.schema.json",
    type: "object",
    required: ["schema_version", "project", "solver"],
    properties: {
      schema_version: { const: "1.0" },
      project: {
        type: "object",
        required: ["name", "units"],
        properties: {
          name: { type: "string" },
          units: { enum: ["CFS", "GPM", "MGD", "CMS", "LPS", "MLD"] },
          crs: { type: "string", description: "EPSG code or WKT" },
          notes: { type: "string" },
        },
      },
      solver: {
        type: "object",
        required: ["kernel", "version"],
        properties: {
          kernel: { enum: ["swmm5-classic", "swmm6", "sxpf-rust"] },
          version: { type: "string", description: "semver range" },
          flow_routing: { enum: ["STEADY", "KINWAVE", "DYNWAVE"] },
          extras: { type: "object", additionalProperties: true },
        },
      },
    },
  },
  "scenario.schema.json": {
    $id: "scenario.schema.json",
    type: "object",
    required: ["id", "schema_version"],
    properties: {
      id: { type: "string", pattern: "^[a-z0-9][a-z0-9._-]*$" },
      schema_version: { const: "1.0" },
      extends: { type: "string", description: "Parent scenario id" },
      overrides: {
        type: "array",
        items: {
          type: "object",
          required: ["target", "set"],
          properties: {
            target: { enum: ["nodes", "links", "subcatchments", "controls"] },
            where: { type: "string", description: "SQL-like predicate" },
            set: {
              type: "object",
              additionalProperties: {
                oneOf: [
                  { type: ["number", "string", "boolean", "null"] },
                  {
                    type: "object",
                    required: ["op", "value"],
                    properties: {
                      op: { enum: ["set", "add", "multiply", "scale_to"] },
                      value: {},
                    },
                  },
                ],
              },
            },
          },
        },
      },
      parameters: {
        type: "array",
        items: {
          type: "object",
          required: ["name", "distribution"],
          properties: {
            name: { type: "string" },
            distribution: {
              oneOf: [
                { properties: { type: { const: "uniform" }, low: { type: "number" }, high: { type: "number" } } },
                { properties: { type: { const: "normal" }, mean: { type: "number" }, std: { type: "number" } } },
                { properties: { type: { const: "lognormal" }, mu: { type: "number" }, sigma: { type: "number" } } },
              ],
            },
          },
        },
      },
    },
  },
  "run.schema.json": {
    $id: "run.schema.json",
    type: "object",
    required: ["run_id", "topology_hash", "scenario_hash", "solver", "started", "finished"],
    properties: {
      run_id: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
      topology_hash: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
      scenario_id: { type: "string" },
      scenario_hash: { type: "string" },
      ensemble: {
        type: "object",
        properties: { id: { type: "string" }, sample_id: { type: "integer" } },
      },
      solver: {
        type: "object",
        required: ["kernel", "version", "build"],
        properties: {
          kernel: { type: "string" },
          version: { type: "string" },
          build: { type: "string" },
        },
      },
      started: { type: "string", format: "date-time" },
      finished: { type: "string", format: "date-time" },
      continuity_error: {
        type: "object",
        properties: { flow: { type: "number" }, quality: { type: "number" } },
      },
      outputs: {
        type: "object",
        required: ["zarr", "parquet"],
        properties: {
          zarr: { $ref: "#/$defs/dataset_ref" },
          parquet: { type: "array", items: { $ref: "#/$defs/dataset_ref" } },
        },
      },
    },
  },
  "quality.schema.json": {
    $id: "quality.schema.json",
    title: "SXPF Water Quality (v1.0, first-class)",
    type: "object",
    required: ["schema_version", "pollutants"],
    properties: {
      schema_version: { const: "1.0" },
      pollutants: { $ref: "sxpf.schema.json#/$defs/parquet_ref", description: "quality/pollutants.parquet" },
      landuses: { $ref: "sxpf.schema.json#/$defs/parquet_ref" },
      buildup: { $ref: "sxpf.schema.json#/$defs/parquet_ref" },
      washoff: { $ref: "sxpf.schema.json#/$defs/parquet_ref" },
      coverages: { $ref: "sxpf.schema.json#/$defs/parquet_ref" },
      loadings: { $ref: "sxpf.schema.json#/$defs/parquet_ref" },
      treatment: { $ref: "sxpf.schema.json#/$defs/parquet_ref" },
      dialect_notes: {
        type: "object",
        description: "Fields that differ between SWMM5 and SWMM6 exports",
        properties: {
          pollutants_dwf_concen: { enum: ["swmm5:optional-col10", "swmm6:typed-field"] },
          treatment_equation_ast: { enum: ["swmm5:derived-on-import", "swmm6:first-class"] },
        },
      },
    },
  },
};

export type ArrowField = {
  name: string;
  type: string;
  nullable?: boolean;
  dict?: boolean;
  notes?: string;
};

export type ParquetTable = {
  name: string;
  purpose: string;
  partition: string[];
  sortWithinFile: string;
  fields: ArrowField[];
};

export const PARQUET_LIST: ParquetTable[] = [
  {
    name: "timeseries_node",
    purpose: "Long-format node timeseries — depth, head, inflow, flooding, …",
    partition: ["scenario_id", "variable", "ts_day"],
    sortWithinFile: "(element_id, ts)",
    fields: [
      { name: "run_id", type: "string", notes: "denormalized for cross-run queries" },
      { name: "scenario_id", type: "string" },
      { name: "element_id", type: "string", dict: true, notes: "dictionary-encoded" },
      { name: "variable", type: "string", dict: true },
      { name: "ts", type: "timestamp[ms, UTC]", notes: "delta-encoded" },
      { name: "value", type: "float32", notes: "byte-stream-split + zstd-3" },
      { name: "quality", type: "uint8", notes: "bitfield: surcharged|flooded|dry|interpolated|assimilated" },
    ],
  },
  {
    name: "summary",
    purpose: "One row per (run, element) — peaks, totals, mass-balance.",
    partition: ["scenario_id"],
    sortWithinFile: "(element_kind, element_id)",
    fields: [
      { name: "run_id", type: "string" },
      { name: "scenario_id", type: "string" },
      { name: "element_kind", type: "string", dict: true },
      { name: "element_id", type: "string", dict: true },
      { name: "peak_value", type: "float64" },
      { name: "peak_time", type: "timestamp[ms, UTC]" },
      { name: "total_volume", type: "float64" },
      { name: "hours_flooded", type: "float64" },
      { name: "hours_surcharged", type: "float64" },
      { name: "mass_balance_error", type: "float64" },
    ],
  },
  {
    name: "events",
    purpose: "Discrete events — floods, overflows, RTC firings, pump cycles.",
    partition: ["scenario_id"],
    sortWithinFile: "(element_id, start_ts)",
    fields: [
      { name: "run_id", type: "string" },
      { name: "scenario_id", type: "string" },
      { name: "element_id", type: "string", dict: true },
      { name: "kind", type: "string", dict: true, notes: "flood|overflow|surcharge|pump_start|pump_stop|rtc_fire|dwf_violation" },
      { name: "start_ts", type: "timestamp[ms, UTC]" },
      { name: "end_ts", type: "timestamp[ms, UTC]" },
      { name: "duration_s", type: "float32" },
      { name: "magnitude", type: "float64" },
      { name: "peak_value", type: "float64" },
      { name: "attrs", type: "struct<…>", notes: "kind-specific extras" },
    ],
  },
  {
    name: "quality_pollutants",
    purpose: "Pollutant catalog — one row per pollutant. SWMM5 + SWMM6 union.",
    partition: ["scenario_id"],
    sortWithinFile: "(pollutant_id)",
    fields: [
      { name: "pollutant_id", type: "string", dict: true },
      { name: "units", type: "string", dict: true, notes: "MG/L | UG/L | #/L" },
      { name: "rain_concen", type: "float64" },
      { name: "gw_concen", type: "float64" },
      { name: "ii_concen", type: "float64" },
      { name: "dwf_concen", type: "float64", notes: "SWMM5 optional col 10 / SWMM6 typed field" },
      { name: "decay_coeff", type: "float64", notes: "1/day" },
      { name: "snow_only", type: "bool" },
      { name: "co_pollutant", type: "string", dict: true },
      { name: "co_fraction", type: "float32" },
    ],
  },
  {
    name: "quality_landuse",
    purpose: "Land uses + buildup + washoff + coverages + loadings (long-form join).",
    partition: ["scenario_id"],
    sortWithinFile: "(landuse_id, pollutant_id)",
    fields: [
      { name: "landuse_id", type: "string", dict: true },
      { name: "pollutant_id", type: "string", dict: true, notes: "null for landuse-only rows" },
      { name: "kind", type: "string", dict: true, notes: "landuse|buildup|washoff|coverage|loading" },
      { name: "func", type: "string", dict: true, notes: "POW|EXP|SAT|EXT|RC|EMC" },
      { name: "c1", type: "float64" },
      { name: "c2", type: "float64" },
      { name: "c3", type: "float64" },
      { name: "per_unit", type: "string", dict: true, notes: "AREA|CURB" },
      { name: "subcatchment_id", type: "string", dict: true, notes: "for coverage/loading rows" },
      { name: "percent", type: "float32", notes: "coverage rows" },
      { name: "initial_load", type: "float64", notes: "loading rows" },
    ],
  },
  {
    name: "quality_treatment",
    purpose: "Node-level treatment / removal expressions.",
    partition: ["scenario_id"],
    sortWithinFile: "(node_id, pollutant_id)",
    fields: [
      { name: "node_id", type: "string", dict: true },
      { name: "pollutant_id", type: "string", dict: true },
      { name: "removal_expr", type: "string", notes: "verbatim SWMM5 formula" },
      { name: "equation_ast", type: "struct<…>", notes: "SWMM6-first-class typed AST" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Canonical bundle — single artifact other components validate against.
// ---------------------------------------------------------------------------
export type CanonicalBundle = {
  $id: string;
  sxpf_schema_version: string;
  bundle_revision: string;
  generated_at: string;
  units: typeof CANONICAL_UNITS;
  crs: typeof CANONICAL_CRS;
  timestamps: typeof CANONICAL_TIMESTAMPS;
  foreign_keys: ForeignKey[];
  json_schemas: Record<string, unknown>;
  parquet_tables: ParquetTable[];
};

export function buildCanonicalBundle(now: Date = new Date()): CanonicalBundle {
  return {
    $id: SXPF_BUNDLE_ID,
    sxpf_schema_version: SXPF_SCHEMA_VERSION,
    bundle_revision: SXPF_BUNDLE_REVISION,
    generated_at: now.toISOString(),
    units: CANONICAL_UNITS,
    crs: CANONICAL_CRS,
    timestamps: CANONICAL_TIMESTAMPS,
    foreign_keys: FOREIGN_KEYS,
    json_schemas: JSON_SCHEMAS,
    parquet_tables: PARQUET_LIST,
  };
}

