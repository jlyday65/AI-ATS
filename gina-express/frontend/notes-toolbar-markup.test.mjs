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
assert.equal((once.src.match(/data-kimberley-notes-link=/g) || []).length, 1);
assert.doesNotMatch(once.src, /<\/span>\s*<\/button>/);

const twice = insertNotesWithAddCandidate(once.src);
assert.equal(twice.ok, true, twice.reason);
assert.equal((twice.src.match(/data-kimberley-notes-group=/g) || []).length, 1);

// Exact prior Vite failure: </a>/button>
const viteBroken = `
              <button className="toolbarBtn" onClick={openAdd}>
                <Plus size={14} /> Add candidate
              <a data-kimberley-notes-link="1" href="/notes">
                Kimberley Notes
              </a>/button>
            </div>
`;
const healed = insertNotesWithAddCandidate(viteBroken);
assert.equal(healed.ok, true, healed.reason);
assert.doesNotMatch(healed.src, /[^<]\/button>/);
assert.doesNotMatch(healed.src, /<\/span>\s*<\/button>/);

// Exact current Mac failure: </span></button>
const spanButtonBroken = `
            <div>
              <span
              data-kimberley-notes-group="1"
              style={{
                display: "inline-flex",
                alignItems: "stretch",
                verticalAlign: "middle",
              }}
            >
              <button style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }} className="toolbarBtn" onClick={openAdd}>
                <Plus size={14} /> Add candidate</button>
              <a
          data-kimberley-notes-link="1"
          href="/notes"
          target="_blank"
          rel="noreferrer"
          className="toolbarBtn"
          style={{
            display: "inline-flex",
            alignItems: "center",
          }}
        >
            Kimberley Notes
          </a>
              </span></button>
            </div>
          </div>

        {storageError && (
          <div>err</div>
        )}
`;
const spanFixed = insertNotesWithAddCandidate(spanButtonBroken);
assert.equal(spanFixed.ok, true, spanFixed.reason);
assert.doesNotMatch(spanFixed.src, /<\/span>\s*<\/button>/);
assert.match(spanFixed.src, /\{storageError && \(/);
assert.equal(
  (spanFixed.src.match(/data-kimberley-notes-group=/g) || []).length,
  1,
);

const partial = healBrokenNotesToolbar(`foo</a>/button>bar`);
assert.match(partial, /<\/a><\/button>/);

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

console.log("notes-toolbar-markup tests passed");
