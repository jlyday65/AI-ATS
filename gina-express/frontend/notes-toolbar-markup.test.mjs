#!/usr/bin/env node
import assert from "node:assert/strict";
import os from "node:os";
import {
  insertNotesWithAddCandidate,
  isToolbarCorrupt,
  resolveAppJsxPath,
} from "./notes-toolbar-markup.mjs";

const sample = `
              <button className="toolbarBtn" onClick={openAdd}>
                <Plus size={14} /> Add candidate
              </button>
`;

const once = insertNotesWithAddCandidate(sample);
assert.equal(once.ok, true, once.reason);
assert.equal(isToolbarCorrupt(once.src), null);
assert.doesNotMatch(once.src, /data-kimberley-notes-group=/);
assert.match(once.src, /Add candidate\s*<\/button>\s*<a\b[^>]*data-kimberley-notes-link/);
assert.equal((once.src.match(/data-kimberley-notes-link=/g) || []).length, 1);

const twice = insertNotesWithAddCandidate(once.src);
assert.equal(twice.ok, true, twice.reason);
assert.equal((twice.src.match(/data-kimberley-notes-link=/g) || []).length, 1);

// Prior failures must clean up to sibling form
const spanButtonBroken = `
            <div>
              <span data-kimberley-notes-group="1">
              <button className="toolbarBtn" onClick={openAdd}>
                <Plus size={14} /> Add candidate</button>
              <a data-kimberley-notes-link="1" href="/notes">Kimberley Notes</a>
              </span></button>
            </div>
`;
assert.equal(isToolbarCorrupt(spanButtonBroken), "span-button");
const fixed = insertNotesWithAddCandidate(spanButtonBroken);
assert.equal(fixed.ok, true, fixed.reason);
assert.equal(isToolbarCorrupt(fixed.src), null);
assert.doesNotMatch(fixed.src, /<\/span>\s*<\/button>/);
assert.doesNotMatch(fixed.src, /data-kimberley-notes-group=/);

const viteBroken = `
              <button className="toolbarBtn" onClick={openAdd}>
                <Plus size={14} /> Add candidate
              <a data-kimberley-notes-link="1" href="/notes">Kimberley Notes</a>/button>
            </div>
`;
const healed = insertNotesWithAddCandidate(viteBroken);
assert.equal(healed.ok, true, healed.reason);
assert.equal(isToolbarCorrupt(healed.src), null);

const home = os.homedir();
assert.equal(
  resolveAppJsxPath([
    "node",
    "x.mjs",
    " ~/lyday-gina-backend/gina-backend/frontend/src/App.jsx",
  ]),
  `${home}/lyday-gina-backend/gina-backend/frontend/src/App.jsx`,
);

console.log("notes-toolbar-markup tests passed");
