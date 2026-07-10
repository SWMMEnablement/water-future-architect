// Engine: static TypeScript module (no runtime, no fetch).
// Concept: single source of truth for the OpenSWMM / SWMM6 status strip
//   (Official / Unofficial roadmap / Current branch) so versions, dates,
//   and labels stay consistent across the architecture, mapping, schemas,
//   and diff pages. Prose that repeats these strings should import from
//   here rather than re-typing the version.
// Reusable: OPENSWMM_STATUS (typed StatusCard[]) and the individual
//   OFFICIAL / UNOFFICIAL / BRANCH exports for inline references.

export type StatusCard = {
  id: "official" | "unofficial" | "branch";
  kicker: string;
  value: string;
  valueMono?: boolean;
  detail: string;
};

export const OFFICIAL: StatusCard = {
  id: "official",
  kicker: "Official",
  value: "v5.2.4",
  detail: "Aug 2023 — frozen since EPA ORD was eliminated",
};

export const UNOFFICIAL: StatusCard = {
  id: "unofficial",
  kicker: "Unofficial roadmap",
  value: "5.3.0 → 6.0.0",
  detail: "Posted Aug 2025 by Caleb Buahin via HydroCouple",
};

export const BRANCH: StatusCard = {
  id: "branch",
  kicker: "Current branch",
  value: "swmm6_rel",
  valueMono: true,
  detail: "v6.0.0-alpha.1 · HydroCouple/openswmm.engine",
};

export const OPENSWMM_STATUS: readonly StatusCard[] = [OFFICIAL, UNOFFICIAL, BRANCH] as const;
