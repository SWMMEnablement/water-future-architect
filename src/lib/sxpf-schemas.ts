// Inline canonical SXPF v1 schemas + Arrow schemas used by the viewer page.

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
