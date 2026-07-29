#!/usr/bin/env node
import assert from "node:assert/strict";
import os from "node:os";
import {
  insertNotesWithAddCandidate,
  healBrokenNotesToolbar,
  resolveAppJsxPath,
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
assert.equal((once.src.match(/data-kimberley-notes-link=/g) || []).length, 1);
assert.doesNotMatch(
  once.src,
  /Add candidate\s*<a\b[^>]*data-kimberley-notes-link/i,
);

const twice = insertNotesWithAddCandidate(once.src);
assert.equal(twice.ok, true, twice.reason);
assert.equal((twice.src.match(/data-kimberley-notes-group=/g) || []).length, 1);

// Exact Vite failure from Mac: </a>/button>
const viteBroken = `
              <button className="toolbarBtn" onClick={openAdd}>
                <Plus size={14} /> Add candidate
              <a
                data-kimberley-notes-link="1"
                href="/notes"
              >
                Kimberley Notes
              </a>/button>
            </div>
`;
const healed = insertNotesWithAddCandidate(viteBroken);
assert.equal(healed.ok, true, healed.reason);
assert.doesNotMatch(healed.src, /[^<]\/button>/);
assert.doesNotMatch(healed.src, /<\/a>\s*\/button>/i);
assert.match(healed.src, /<\/button>/);
assert.match(healed.src, /data-kimberley-notes-group="1"/);
assert.equal((healed.src.match(/data-kimberley-notes-link=/g) || []).length, 1);

const partial = healBrokenNotesToolbar(`foo</a>/button>bar`);
assert.match(partial, /<\/a><\/button>/);

// Path: leading space + ~/ must expand (the Mac `\\` line-break bug)
const home = os.homedir();
const withSpace = resolveAppJsxPath([
  "node",
  "patch.mjs",
  " ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx",
]);
assert.equal(
  withSpace,
  `${home}/lyday-gina-backend/gina-backend/frontend/src/App.jsx`,
);

const styled = insertNotesWithAddCandidate(`
  <button style={{ background: "#2F6459", color: "#fff", borderRadius: 8, border: "none", padding: "8px 12px" }}>
    <Plus size={14} /> Add candidate
  </button>
`);
assert.equal(styled.ok, true, styled.reason);
assert.equal((styled.src.match(/background: "#2F6459"/g) || []).length, 2);

console.log("notes-toolbar-markup tests passed");
