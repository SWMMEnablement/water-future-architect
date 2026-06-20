export type MappingRow = {
  section: string;
  target: string;
  kind: "topology" | "forcings" | "scenarios" | "manifest" | "controls" | "quality" | "ui" | "passthrough";
  notes: string;
  roundTrip: "lossless" | "semantic" | "lossy";
};

export const MAPPING: MappingRow[] = [
  { section: "[TITLE]", target: "manifest.project.name + notes", kind: "manifest", notes: "Multi-line preserved in notes", roundTrip: "lossless" },
  { section: "[OPTIONS]", target: "manifest.solver + solver_defaults", kind: "manifest", notes: "Typed; unknown keys → solver.extras", roundTrip: "lossless" },
  { section: "[EVAPORATION]", target: "forcings/evaporation.parquet", kind: "forcings", notes: "Series or monthly", roundTrip: "lossless" },
  { section: "[TEMPERATURE]", target: "forcings/temperature.parquet", kind: "forcings", notes: "Series + wind + snowmelt block", roundTrip: "lossless" },
  { section: "[RAINGAGES]", target: "topology/raingages.parquet", kind: "topology", notes: "FK to forcings/rainfall/<id>", roundTrip: "lossless" },
  { section: "[SUBCATCHMENTS]", target: "topology/subcatchments.parquet", kind: "topology", notes: "Merged with [SUBAREAS] and [INFILTRATION]", roundTrip: "semantic" },
  { section: "[SUBAREAS]", target: "topology/subcatchments.parquet (cols)", kind: "topology", notes: "Folded into parent row", roundTrip: "semantic" },
  { section: "[INFILTRATION]", target: "topology/subcatchments.parquet (cols)", kind: "topology", notes: "Method-specific columns (Horton/GA/CN)", roundTrip: "semantic" },
  { section: "[JUNCTIONS]", target: "topology/nodes.parquet kind=junction", kind: "topology", notes: "", roundTrip: "lossless" },
  { section: "[OUTFALLS]", target: "topology/nodes.parquet kind=outfall", kind: "topology", notes: "Tide/fixed/free preserved in attrs", roundTrip: "lossless" },
  { section: "[STORAGE]", target: "topology/nodes.parquet kind=storage", kind: "topology", notes: "+ curve ref into topology/curves", roundTrip: "lossless" },
  { section: "[DIVIDERS]", target: "topology/nodes.parquet kind=divider", kind: "topology", notes: "", roundTrip: "lossless" },
  { section: "[CONDUITS]", target: "topology/links.parquet kind=conduit", kind: "topology", notes: "Merged with [XSECTIONS] and [LOSSES]", roundTrip: "semantic" },
  { section: "[XSECTIONS]", target: "topology/links.parquet (cols)", kind: "topology", notes: "Geometry type + parameters folded in", roundTrip: "semantic" },
  { section: "[LOSSES]", target: "topology/links.parquet (cols)", kind: "topology", notes: "Entry/exit/avg loss + flap gate", roundTrip: "semantic" },
  { section: "[PUMPS]", target: "topology/links.parquet kind=pump", kind: "topology", notes: "+ curve ref", roundTrip: "lossless" },
  { section: "[ORIFICES]", target: "topology/links.parquet kind=orifice", kind: "topology", notes: "", roundTrip: "lossless" },
  { section: "[WEIRS]", target: "topology/links.parquet kind=weir", kind: "topology", notes: "", roundTrip: "lossless" },
  { section: "[OUTLETS]", target: "topology/links.parquet kind=outlet", kind: "topology", notes: "Rating curve or functional", roundTrip: "lossless" },
  { section: "[CONTROLS]", target: "topology/controls/<rule>.rule.yaml", kind: "controls", notes: "Parsed AST + original_text for round-trip", roundTrip: "semantic" },
  { section: "[CURVES]", target: "topology/curves/<id>.parquet", kind: "topology", notes: "Typed (pump/storage/rating/...)", roundTrip: "lossless" },
  { section: "[TIMESERIES]", target: "forcings/series/<id>.parquet", kind: "forcings", notes: "External file refs preserved", roundTrip: "lossless" },
  { section: "[PATTERNS]", target: "topology/patterns/<id>.parquet", kind: "topology", notes: "Hourly/daily/monthly/weekend", roundTrip: "lossless" },
  { section: "[POLLUTANTS]", target: "quality/pollutants.parquet", kind: "quality", notes: "Feature-flag in v1.0", roundTrip: "lossless" },
  { section: "[LANDUSES]", target: "quality/landuses.parquet", kind: "quality", notes: "", roundTrip: "lossless" },
  { section: "[BUILDUP]", target: "quality/buildup.parquet", kind: "quality", notes: "", roundTrip: "lossless" },
  { section: "[WASHOFF]", target: "quality/washoff.parquet", kind: "quality", notes: "", roundTrip: "lossless" },
  { section: "[COVERAGES]", target: "quality/coverages.parquet", kind: "quality", notes: "", roundTrip: "lossless" },
  { section: "[LOADINGS]", target: "quality/loadings.parquet", kind: "quality", notes: "Initial pollutant loads", roundTrip: "lossless" },
  { section: "[TREATMENT]", target: "quality/treatment.parquet", kind: "quality", notes: "Removal expressions kept verbatim", roundTrip: "semantic" },
  { section: "[LID_CONTROLS]", target: "topology/lid/controls.parquet", kind: "topology", notes: "Layered LID definition", roundTrip: "lossless" },
  { section: "[LID_USAGE]", target: "topology/lid/usage.parquet", kind: "topology", notes: "FK to subcatchments + lid", roundTrip: "lossless" },
  { section: "[DWF]", target: "forcings/inflows.parquet kind=dwf", kind: "forcings", notes: "Pattern refs preserved", roundTrip: "lossless" },
  { section: "[INFLOWS]", target: "forcings/inflows.parquet kind=direct", kind: "forcings", notes: "", roundTrip: "lossless" },
  { section: "[RDII]", target: "forcings/inflows.parquet kind=rdii", kind: "forcings", notes: "Unit hydrograph ref", roundTrip: "lossless" },
  { section: "[HYDROGRAPHS]", target: "forcings/hydrographs/<id>.parquet", kind: "forcings", notes: "RTK by month", roundTrip: "lossless" },
  { section: "[ADJUSTMENTS]", target: "scenarios/_base.adjustments", kind: "scenarios", notes: "Monthly climate adjustments", roundTrip: "lossless" },
  { section: "[EVENTS]", target: "scenarios/_base.events", kind: "scenarios", notes: "Event-mode time windows", roundTrip: "lossless" },
  { section: "[REPORT]", target: "views/report.yaml", kind: "ui", notes: "Reporting flags only — not solver state", roundTrip: "lossless" },
  { section: "[TAGS]", target: "topology/*.parquet (tags col)", kind: "topology", notes: "Folded into element tags array", roundTrip: "lossless" },
  { section: "[MAP]", target: "views/map.yaml", kind: "ui", notes: "Map extents + units", roundTrip: "lossless" },
  { section: "[COORDINATES]", target: "topology/nodes.parquet geometry", kind: "topology", notes: "GeoParquet point", roundTrip: "lossless" },
  { section: "[VERTICES]", target: "topology/links.parquet geometry", kind: "topology", notes: "GeoParquet linestring", roundTrip: "lossless" },
  { section: "[POLYGONS]", target: "topology/subcatchments.parquet geometry", kind: "topology", notes: "GeoParquet polygon", roundTrip: "lossless" },
  { section: "[SYMBOLS]", target: "topology/raingages.parquet geometry", kind: "topology", notes: "", roundTrip: "lossless" },
  { section: "[LABELS]", target: "views/labels.yaml", kind: "ui", notes: "Map labels", roundTrip: "lossless" },
  { section: "[BACKDROP]", target: "views/backdrop.yaml", kind: "ui", notes: "Backdrop image + extents", roundTrip: "lossless" },
  { section: "[PROFILES]", target: "views/profiles.yaml", kind: "ui", notes: "Saved profile plots", roundTrip: "lossless" },
  { section: "[FILES]", target: "manifest.io_files", kind: "manifest", notes: "Save/use hotstart, rdii, climate", roundTrip: "lossless" },
  { section: "<unknown>", target: "topology/_passthrough/<SECTION>.txt", kind: "passthrough", notes: "Original order + provenance.source_line; export verbatim", roundTrip: "lossless" },
];

export const KIND_COLOR: Record<MappingRow["kind"], string> = {
  topology: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  forcings: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  scenarios: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  manifest: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  controls: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  quality: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  ui: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  passthrough: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
};

export const RT_COLOR: Record<MappingRow["roundTrip"], string> = {
  lossless: "text-emerald-400",
  semantic: "text-amber-400",
  lossy: "text-rose-400",
};
