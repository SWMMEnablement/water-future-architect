// Engine: static TypeScript module + zod runtime validation.
// Concept: single source of truth for the OpenSWMM / SWMM6 status strip
//   (Official / Unofficial roadmap / Current branch) so versions, dates,
//   and labels stay consistent across the site. Any prose that repeats
//   these strings should import from here rather than re-typing them.
// Reusable: OPENSWMM_STATUS (typed StatusCard[]), OFFICIAL / UNOFFICIAL /
//   BRANCH exports, OFFICIAL_VERSION_NUMBER + UPCOMING_VERSIONS helpers,
//   and the zod schema for CI / consumer validation.

import { z } from "zod";

export const StatusCardSchema = z.object({
  id: z.enum(["official", "unofficial", "branch"]),
  kicker: z.string().min(1),
  value: z.string().min(1),
  valueMono: z.boolean().optional(),
  detail: z.string().min(1),
});

export type StatusCard = z.infer<typeof StatusCardSchema>;

const OFFICIAL_RAW: StatusCard = {
  id: "official",
  kicker: "Official",
  value: "v5.2.4",
  detail: "Aug 2023 — frozen since EPA ORD was eliminated",
};

const UNOFFICIAL_RAW: StatusCard = {
  id: "unofficial",
  kicker: "Unofficial roadmap",
  value: "5.3.0 → 6.0.0",
  detail: "Posted Aug 2025 by Caleb Buahin via HydroCouple",
};

const BRANCH_RAW: StatusCard = {
  id: "branch",
  kicker: "Current branch",
  value: "swmm6_rel",
  valueMono: true,
  detail: "v6.0.0-alpha.1 · HydroCouple/openswmm.engine",
};

// Fail fast: any malformed card throws at module load in dev/CI/prod.
export const OFFICIAL = StatusCardSchema.parse(OFFICIAL_RAW);
export const UNOFFICIAL = StatusCardSchema.parse(UNOFFICIAL_RAW);
export const BRANCH = StatusCardSchema.parse(BRANCH_RAW);

export const OPENSWMM_STATUS: readonly StatusCard[] = z
  .tuple([StatusCardSchema, StatusCardSchema, StatusCardSchema])
  .parse([OFFICIAL, UNOFFICIAL, BRANCH]);

// Derived helpers so prose can reference the single source of truth.
export const OFFICIAL_VERSION_NUMBER = OFFICIAL.value.replace(/^v/, ""); // "5.2.4"
export const UPCOMING_VERSIONS = UNOFFICIAL.value.split(/\s*→\s*/); // ["5.3.0","6.0.0"]
