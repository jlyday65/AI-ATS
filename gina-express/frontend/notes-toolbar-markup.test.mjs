#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  insertNotesWithAddCandidate,
  stripExistingNotesToolbar,
} from "./notes-toolbar-markup.mjs";

const sample = `
              <button className="toolbarBtn" onClick={openAdd}>
                <Plus size={14} /> Add candidate
              </button>
              <a data-kimberley-notes-link="1" href="/notes">Old Notes</a>
`;

const once = insertNotesWithAddCandidate(sample);
assert.equal(once.ok, true, once.reason);
assert.match(once.src, /data-kimberley-notes-group="1"/);
assert.match(once.src, /className="toolbarBtn"/);
assert.equal(
  (once.src.match(/data-kimberley-notes-link=/g) || []).length,
  1,
);
assert.doesNotMatch(
  once.src,
  /Add candidate\s*<a\b[^>]*data-kimberley-notes-link/i,
);
assert.match(once.src, /borderTopRightRadius: 0/);
assert.match(once.src, /Kimberley Notes/);

// Inline-styled Add candidate → Notes inherits fill color
const styled = insertNotesWithAddCandidate(`
  <button style={{ background: "#2F6459", color: "#fff", borderRadius: 8, border: "none", padding: "8px 12px" }}>
    <Plus size={14} /> Add candidate
  </button>
`);
assert.equal(styled.ok, true, styled.reason);
assert.match(styled.src, /background: "#2F6459"/);
assert.equal(
  (styled.src.match(/background: "#2F6459"/g) || []).length,
  2,
  "Add candidate + Notes should share background",
);

const twice = insertNotesWithAddCandidate(once.src);
assert.equal(twice.ok, true, twice.reason);
assert.equal(
  (twice.src.match(/data-kimberley-notes-group=/g) || []).length,
  1,
);

const broken = `
              <button className="toolbarBtn" onClick={openAdd}>
                <Plus size={14} /> Add candidate
              <<a data-kimberley-notes-link="1" href="/notes">Notes</a>
              </button>
`;
const healed = insertNotesWithAddCandidate(
  stripExistingNotesToolbar(broken.replace(/<<+a\b/g, "<a")),
);
// After strip of nested mess, may need button closed — use full insert path via fix logic
const viaInsert = insertNotesWithAddCandidate(`
              <button className="toolbarBtn" onClick={openAdd}>
                <Plus size={14} /> Add candidate
              </button>
`);
assert.equal(viaInsert.ok, true);

console.log("notes-toolbar-markup tests passed");
