#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Artifact: Route header provenance check
//   Engine   · Node.js script (invoked via `bun run check:headers` / lint)
//   Concept  · Enforce the "Engine · Concept · Reusable" header on route files
//   Reusable · Minimal header-block linter pattern (glob + regex, zero deps)
// ---------------------------------------------------------------------------
//
// Every src/routes/*.tsx file (except auto-generated / framework files) must
// begin with a comment block naming its Engine, Concept, and Reusable pieces.
// Run as a pre-commit hook or in CI to keep the provenance convention honest.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const ROUTES_DIR = join(ROOT, "src/routes");

// Files that are framework-owned or shell files — exempt from the rule.
const EXEMPT = new Set([
  "routeTree.gen.ts",
  "__root.tsx",
  "README.md",
]);

/** @param {string} dir */
function walk(dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full));
    } else if (entry.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

const REQUIRED = ["Engine", "Concept", "Reusable"];

/** @param {string} file */
function checkFile(file) {
  const src = readFileSync(file, "utf8");
  // Only inspect the first ~40 lines so the header must actually be a header.
  const head = src.split("\n").slice(0, 40).join("\n");
  const missing = REQUIRED.filter(
    (label) => !new RegExp(`^\\s*//.*\\b${label}\\b`, "m").test(head),
  );
  return missing;
}

const files = walk(ROUTES_DIR).filter((f) => {
  const base = f.split("/").pop() ?? "";
  return !EXEMPT.has(base);
});

const failures = [];
for (const f of files) {
  const missing = checkFile(f);
  if (missing.length) failures.push({ file: relative(ROOT, f), missing });
}

if (failures.length) {
  console.error(
    "\n✖ Route header check failed. Every src/routes/*.tsx must start with an\n" +
      "  Engine · Concept · Reusable comment block (see src/routes/index.tsx).\n",
  );
  for (const { file, missing } of failures) {
    console.error(`  - ${file}  (missing: ${missing.join(", ")})`);
  }
  console.error("");
  process.exit(1);
}

console.log(`✓ Route header check passed (${files.length} files).`);
