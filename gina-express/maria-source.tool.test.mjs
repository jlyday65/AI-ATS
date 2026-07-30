#!/usr/bin/env node
/**
 * Quick checks for Maria roleTitle inference.
 *   node gina-express/maria-source.tool.test.mjs
 */
import {
  extractLocationFromText,
  extractRoleTitleFromText,
} from "./maria-source.tool.js";

const cases = [
  [
    "source a Warehouse Assistant Manager candidate in Atlanta",
    "Warehouse Assistant Manager",
    "Atlanta",
  ],
  [
    "source Warehouse Assistant Manager in Atlanta, GA",
    "Warehouse Assistant Manager",
    "Atlanta, GA",
  ],
  [
    "Ask Maria to source a Warehouse Assistant Manager in Atlanta; resumes required",
    "Warehouse Assistant Manager",
    "Atlanta",
  ],
  [
    "Have Maria find Warehouse Assistant Manager candidates in Atlanta",
    "Warehouse Assistant Manager",
    "Atlanta",
  ],
  [
    "source candidates for Warehouse Assistant Manager in Atlanta",
    "Warehouse Assistant Manager",
    "Atlanta",
  ],
  [
    "find candidates for the Warehouse Assistant Manager role in Atlanta",
    "Warehouse Assistant Manager",
    "Atlanta",
  ],
  [
    "Maria please source Warehouse Assistant Managers",
    "Warehouse Assistant Managers",
    "",
  ],
  ["Provide a status update for Kimberley", "", ""],
  ["roleTitle: Warehouse Assistant Manager", "Warehouse Assistant Manager", ""],
  [
    '{"targetAgent":"maria","task":"Source Warehouse Assistant Manager","roleTitle":"Warehouse Assistant Manager"}',
    "Warehouse Assistant Manager",
    "",
  ],
  ["source candidates in Atlanta", "", "Atlanta"],
];

let failed = 0;
for (const [text, wantRole, wantLoc] of cases) {
  const role = extractRoleTitleFromText(text);
  const loc = extractLocationFromText(text);
  const okRole = role === wantRole;
  const okLoc = !wantLoc || loc === wantLoc || loc.startsWith(wantLoc);
  if (!okRole || !okLoc) {
    failed += 1;
    console.error("FAIL", JSON.stringify(text));
    console.error("  role:", JSON.stringify(role), "want", JSON.stringify(wantRole));
    console.error("  loc:", JSON.stringify(loc), "want", JSON.stringify(wantLoc));
  } else {
    console.log("ok", wantRole || "(none)", text.slice(0, 60));
  }
}

if (failed) {
  console.error(`\n${failed} failing case(s)`);
  process.exit(1);
}
console.log("\nAll extractRoleTitleFromText cases passed.");
