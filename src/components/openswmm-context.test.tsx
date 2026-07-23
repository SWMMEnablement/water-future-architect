// ---------------------------------------------------------------------------
// Artifact: OpenSWMM status strip — component test
//   Engine   · bun test + react-dom/server (renderToStaticMarkup)
//   Concept  · Render the shared context section and assert every card's
//              kicker/value/detail from openswmm-status appears verbatim.
//   Reusable · SSR-only markup assertions as a lightweight React test pattern
// ---------------------------------------------------------------------------
import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { OpenSwmmContext } from "./openswmm-context";
import { OPENSWMM_STATUS, OFFICIAL, BRANCH, UPCOMING_VERSIONS } from "@/lib/openswmm-status";

test("status strip renders every card's text from the data source", () => {
  const html = renderToStaticMarkup(<OpenSwmmContext />);
  for (const card of OPENSWMM_STATUS) {
    expect(html).toContain(card.kicker);
    expect(html).toContain(card.value);
    expect(html).toContain(card.detail);
  }
});

test("prose references the single source of truth", () => {
  const html = renderToStaticMarkup(<OpenSwmmContext />);
  // Official version referenced in USEPA source link
  expect(html).toContain(`/releases/tag/${OFFICIAL.value}`);
  // Branch value referenced in swmm6_rel source link
  expect(html).toContain(`/tree/${BRANCH.value}`);
  // Upcoming versions surfaced in the roadmap prose
  expect(html).toContain(UPCOMING_VERSIONS[0]);
  expect(html).toContain(UPCOMING_VERSIONS[1]);
});

test("compact mode still renders the three status kickers via prose fallbacks", () => {
  // In compact mode the card grid is hidden but the prose still cites the version.
  const html = renderToStaticMarkup(<OpenSwmmContext compact />);
  expect(html).toContain(OFFICIAL.value);
  expect(html).toContain(BRANCH.value);
});
