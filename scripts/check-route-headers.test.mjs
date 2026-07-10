// ---------------------------------------------------------------------------
// Artifact: Route header check — tests
//   Engine   · Node.js built-in test runner (`node --test`)
//   Concept  · Verify the header linter passes, fails, and skips as designed
//   Reusable · Fixture-dir + spawnSync pattern for testing zero-dep CLI scripts
// ---------------------------------------------------------------------------
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const SCRIPT = new URL("./check-route-headers.mjs", import.meta.url).pathname;

const GOOD_HEADER = `// ---------------------------------------------------------------------------
// Artifact: Sample route
//   Engine   · TanStack Start
//   Concept  · Example page
//   Reusable · N/A
// ---------------------------------------------------------------------------
export const x = 1;
`;

const BAD_HEADER = `// Just a normal comment
export const x = 1;
`;

const PARTIAL_HEADER = `// Engine   · TanStack Start
// Concept  · Missing the reusable line entirely
export const x = 1;
`;

function makeFixture(files) {
  const dir = mkdtempSync(join(tmpdir(), "route-headers-"));
  for (const [name, contents] of Object.entries(files)) {
    const full = join(dir, name);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, contents);
  }
  return dir;
}

function runCheck(routesDir) {
  return spawnSync("node", [SCRIPT], {
    env: { ...process.env, ROUTES_DIR_OVERRIDE: routesDir },
    encoding: "utf8",
  });
}

test("passes when every route file has the header block", () => {
  const dir = makeFixture({ "index.tsx": GOOD_HEADER, "about.tsx": GOOD_HEADER });
  try {
    const res = runCheck(dir);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /Route header check passed \(2 files\)/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("fails and lists every missing label for a bad file", () => {
  const dir = makeFixture({ "index.tsx": GOOD_HEADER, "broken.tsx": BAD_HEADER });
  try {
    const res = runCheck(dir);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /broken\.tsx:1/);
    assert.match(res.stderr, /missing: Engine, Concept, Reusable/);
    // Expected template printed for the developer.
    assert.match(res.stderr, /Engine {3}·/);
    assert.match(res.stderr, /Concept {2}·/);
    assert.match(res.stderr, /Reusable ·/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("reports only the labels actually missing", () => {
  const dir = makeFixture({ "partial.tsx": PARTIAL_HEADER });
  try {
    const res = runCheck(dir);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /missing: Reusable\b/);
    assert.doesNotMatch(res.stderr, /missing:[^)]*Engine/);
    assert.doesNotMatch(res.stderr, /missing:[^)]*Concept/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("skips exempt files (__root.tsx, routeTree.gen.ts, README.md)", () => {
  const dir = makeFixture({
    "index.tsx": GOOD_HEADER,
    "__root.tsx": BAD_HEADER,       // exempt
    "routeTree.gen.ts": BAD_HEADER, // exempt (also .ts, not .tsx — double-skip)
    "README.md": BAD_HEADER,        // exempt (not .tsx anyway)
  });
  try {
    const res = runCheck(dir);
    assert.equal(res.status, 0, res.stderr);
    // Only index.tsx and __root.tsx are .tsx; __root.tsx is exempt → 1 file checked.
    assert.match(res.stdout, /passed \(1 files\)/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("only inspects .tsx files (ignores stray .ts / .md)", () => {
  const dir = makeFixture({
    "index.tsx": GOOD_HEADER,
    "helper.ts": BAD_HEADER,
    "notes.md": BAD_HEADER,
  });
  try {
    const res = runCheck(dir);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /passed \(1 files\)/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("recurses into nested route directories", () => {
  const dir = makeFixture({
    "index.tsx": GOOD_HEADER,
    "nested/child.tsx": BAD_HEADER,
  });
  try {
    const res = runCheck(dir);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /nested\/child\.tsx:1/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
