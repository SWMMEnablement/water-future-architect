// ---------------------------------------------------------------------------
// Artifact: OpenSWMM status data source — unit tests
//   Engine   · bun test (native TS)
//   Concept  · Freeze the exact card values so any drift in labels/versions
//              is caught before it leaks into the site's prose.
//   Reusable · zod-validated fixtures as a pattern for other status modules
// ---------------------------------------------------------------------------
import { test, expect } from "bun:test";
import {
  OFFICIAL,
  UNOFFICIAL,
  BRANCH,
  OPENSWMM_STATUS,
  OFFICIAL_VERSION_NUMBER,
  UPCOMING_VERSIONS,
  StatusCardSchema,
} from "./openswmm-status";

test("OFFICIAL card matches expected snapshot", () => {
  expect(OFFICIAL).toEqual({
    id: "official",
    kicker: "Official",
    value: "v5.2.4",
    detail: "Aug 2023 — frozen since EPA ORD was eliminated",
  });
});

test("UNOFFICIAL card matches expected snapshot", () => {
  expect(UNOFFICIAL).toEqual({
    id: "unofficial",
    kicker: "Unofficial roadmap",
    value: "5.3.0 → 6.0.0",
    detail: "Posted Aug 2025 by Caleb Buahin via HydroCouple",
  });
});

test("BRANCH card matches expected snapshot", () => {
  expect(BRANCH).toEqual({
    id: "branch",
    kicker: "Current branch",
    value: "swmm6_rel",
    valueMono: true,
    detail: "v6.0.0-alpha.1 · HydroCouple/openswmm.engine",
  });
});

test("OPENSWMM_STATUS is the three cards, in order", () => {
  expect(OPENSWMM_STATUS).toHaveLength(3);
  expect(OPENSWMM_STATUS.map((c) => c.id)).toEqual(["official", "unofficial", "branch"]);
});

test("derived helpers stay in sync with the cards", () => {
  expect(OFFICIAL_VERSION_NUMBER).toBe("5.2.4");
  expect(UPCOMING_VERSIONS).toEqual(["5.3.0", "6.0.0"]);
});

test("StatusCardSchema rejects malformed input (fail-fast contract)", () => {
  expect(() =>
    StatusCardSchema.parse({ id: "official", kicker: "", value: "x", detail: "y" }),
  ).toThrow();
  expect(() =>
    StatusCardSchema.parse({ id: "bogus", kicker: "k", value: "v", detail: "d" }),
  ).toThrow();
  expect(() => StatusCardSchema.parse({ id: "branch", value: "v", detail: "d" })).toThrow();
});
