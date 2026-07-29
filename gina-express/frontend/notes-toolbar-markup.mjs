/**
 * Safe Kimberley Notes toolbar insert:
 * - Never wrap Add candidate in a <span> group (that caused </span></button>)
 * - Never nest Notes inside the <button>
 * - Clone Add candidate className/style onto a sibling <a>
 */

import path from "path";
import fs from "fs";

export function resolveAppJsxPath(argv = process.argv) {
  const raw = argv
    .slice(2)
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
  if (!raw) return "";
  const home = process.env.HOME || "";
  let expanded = raw;
  if (raw === "~") expanded = home;
  else if (raw.startsWith("~/")) expanded = path.join(home, raw.slice(2));
  else if (raw.startsWith("~")) {
    expanded = path.join(home, raw.slice(1).replace(/^\//, ""));
  }
  return path.resolve(expanded);
}

export function isToolbarCorrupt(src) {
  const text = String(src);
  if (/<\/a>\s*\/button>/i.test(text)) return "a-slash-button";
  if (/<\/span>\s*<\/button>/i.test(text)) return "span-button";
  if (/data-kimberley-notes-group=/i.test(text)) return "notes-group";
  if (/<<a\b/.test(text)) return "double-lt-a";
  if (/Add candidate\s*<a\b/i.test(text)) return "notes-inside-button";
  const opens = (text.match(/<button\b/gi) || []).length;
  const closes = (text.match(/<\/button>/gi) || []).length;
  if (opens !== closes) return `button-balance-${opens}-${closes}`;
  return null;
}

export function scoreAppJsx(text, label) {
  if (!text || text.length < 5000) {
    return { label, score: -1, reasons: ["too small"], size: text?.length || 0 };
  }
  const reasons = [];
  let s = 0;
  const hasApp =
    /function\s+App\b/.test(text) ||
    /export\s+default\s+function\s+App\b/.test(text) ||
    /const\s+App\s*=/.test(text) ||
    /export\s+default\s+App\b/.test(text);
  if (hasApp) {
    s += 50;
    reasons.push("has App");
  } else reasons.push("NO App");

  if (/Add candidate/i.test(text)) {
    s += 15;
    reasons.push("Add candidate");
  }
  if (/Check for actions/i.test(text)) {
    s += 8;
    reasons.push("actions");
  }
  if (/KimberleyNotes(Gate|Panel)/.test(text)) {
    s -= 25;
    reasons.push("react notes panel");
  }
  const corrupt = isToolbarCorrupt(text);
  if (corrupt) {
    s -= 60;
    reasons.push(`corrupt:${corrupt}`);
  }
  // Prefer backups from before the span-group experiment
  if (/bak-notes-link/i.test(label)) {
    s += 5;
    reasons.push("notes-link bak");
  }
  if (/bak-iframe-notes/i.test(label)) {
    s += 3;
    reasons.push("iframe bak");
  }
  if (/bak-notes-toolbar|bak-fix-notes-toolbar/i.test(label)) {
    s -= 10;
    reasons.push("toolbar bak");
  }
  return { label, score: s, size: text.length, hasApp, reasons };
}

export function pickBestAppJsxBackup(appPath) {
  const bakDir = path.dirname(appPath);
  const files = fs
    .readdirSync(bakDir)
    .filter((n) => n === "App.jsx" || n.startsWith("App.jsx."))
    .map((n) => path.join(bakDir, n))
    .filter((p) => {
      try {
        return fs.statSync(p).isFile();
      } catch {
        return false;
      }
    });

  const candidates = [];
  for (const p of files) {
    // Skip the live broken file when scoring backups only — caller may include it
    try {
      const text = fs.readFileSync(p, "utf8");
      candidates.push({ ...scoreAppJsx(text, p), text, path: p });
    } catch {
      // ignore
    }
  }
  candidates.sort((a, b) => b.score - a.score || b.size - a.size);
  return candidates;
}

export function extractAddCandidateButton(src) {
  const preferred =
    /<button\b([^>]*)>\s*<Plus\b[^>]*\/\s*>\s*Add candidate\s*<\/button>/i;
  const m = src.match(preferred);
  if (m) {
    return {
      full: m[0],
      attrs: m[1] || "",
      index: m.index,
      end: m.index + m[0].length,
    };
  }

  const label = src.search(/Add candidate/i);
  if (label < 0) return null;
  const openRel = src
    .slice(Math.max(0, label - 500), label)
    .lastIndexOf("<button");
  if (openRel < 0) return null;
  const open = Math.max(0, label - 500) + openRel;
  const closeRel = src.slice(label).search(/<\/button>/i);
  if (closeRel < 0) return null;
  const end = label + closeRel + "</button>".length;
  const full = src.slice(open, end);
  if (/<a\b/i.test(full)) return null;
  const attrsMatch = full.match(/^<button\b([^>]*)>/i);
  return {
    full,
    attrs: attrsMatch ? attrsMatch[1] || "" : "",
    index: open,
    end,
  };
}

export function extractClassNameAttr(attrs) {
  const m = String(attrs).match(/\bclassName=(?:\{[^}]*\}|"[^"]*"|'[^']*')/);
  return m ? m[0] : "";
}

export function extractStyleObjectBody(buttonHtml) {
  const m = String(buttonHtml).match(/\bstyle=\{\{([\s\S]*?)\}\}/);
  if (!m) return "";
  return m[1]
    .trim()
    .replace(/,\s*$/, "")
    .replace(/\s*borderTopRightRadius\s*:\s*[^,}\n]+,?/g, "")
    .replace(/\s*borderBottomRightRadius\s*:\s*[^,}\n]+,?/g, "")
    .replace(/^\s*,\s*/, "")
    .replace(/,\s*$/, "")
    .trim();
}

/** Sibling Notes link — matches Add candidate chrome, no wrapper span. */
export function buildNotesLink({ classNameAttr = "", styleBody = "" } = {}) {
  const classLine = classNameAttr ? `\n          ${classNameAttr}` : "";
  const base = styleBody
    ? `${styleBody},`
    : `display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, background: "#2F6459", color: "#fff", border: "none",`;
  return `<a
          data-kimberley-notes-link="1"
          href="/notes"
          target="_blank"
          rel="noreferrer"${classLine}
          style={{
            ${base}
            textDecoration: "none",
            cursor: "pointer",
            marginLeft: 8,
          }}
        >
          Kimberley Notes
        </a>`;
}

export function stripExistingNotesToolbar(src) {
  let out = String(src);

  // Unwrap broken/good groups → keep Add candidate button only
  out = out.replace(
    /\s*<span\b[^>]*data-kimberley-notes-group=["']1["'][^>]*>\s*([\s\S]*?)\s*<\/span>\s*(?:<\/button>)?/gi,
    (full, inner) => {
      const btn =
        inner.match(
          /<button\b[\s\S]*?>\s*<Plus\b[^>]*\/\s*>\s*Add candidate\s*<\/button>/i,
        ) ||
        inner.match(/<button\b[\s\S]*?Add candidate[\s\S]*?<\/button>/i);
      return btn ? `\n              ${btn[0]}` : "";
    },
  );

  out = out.replace(/<\/a>\s*\/button>/gi, "</a></button>");
  out = out.replace(/(^|[^<])\/button>/gi, "$1</button>");
  out = out.replace(/<<+a\b/g, "<a");

  // Notes jammed inside button → pull out then strip
  out = out.replace(
    /(Add candidate)\s*(<a\b[\s\S]*?<\/a>)\s*<\/button>/i,
    "$1</button>",
  );

  out = out.replace(
    /\s*<a\b[^>]*data-kimberley-notes-link=["']1["'][^>]*>[\s\S]*?<\/a>\s*(?:<\/button>)?/gi,
    "",
  );
  out = out.replace(
    /\s*<a\b[^>]*href=["']\/notes["'][^>]*>\s*Kimberley Notes\s*<\/a>\s*(?:<\/button>)?/gi,
    "",
  );

  out = out.replace(/<\/span>\s*<\/button>(\s*<\/div>)/gi, "</span>$1");
  out = out.replace(/(Add candidate\s*<\/button>)\s*<\/button>/gi, "$1");

  // If a leftover empty notes span remains, drop it
  out = out.replace(
    /\s*<span\b[^>]*data-kimberley-notes-group=["']1["'][^>]*>\s*<\/span>/gi,
    "",
  );

  return out;
}

export function insertNotesWithAddCandidate(src) {
  let out = stripExistingNotesToolbar(src);

  // Strip any radius hacks we previously injected into Add candidate
  out = out.replace(
    /\s*borderTopRightRadius\s*:\s*0\s*,\s*borderBottomRightRadius\s*:\s*0\s*,?/g,
    "",
  );

  const found = extractAddCandidateButton(out);
  if (!found) return { ok: false, reason: "add-candidate-missing", src: out };

  // Restore pristine button HTML (no radius hacks)
  let btn = found.full.replace(
    /\s*borderTopRightRadius\s*:\s*0\s*,\s*borderBottomRightRadius\s*:\s*0\s*,?/g,
    "",
  );
  // Clean empty style={{ }} left behind
  btn = btn.replace(/\s*style=\{\{\s*\}\}/g, "");

  const classNameAttr = extractClassNameAttr(found.attrs);
  const styleBody = extractStyleObjectBody(btn);
  const notes = buildNotesLink({ classNameAttr, styleBody });
  const replacement = `${btn}\n              ${notes}`;
  out = out.slice(0, found.index) + replacement + out.slice(found.end);

  const corrupt = isToolbarCorrupt(out);
  if (corrupt) return { ok: false, reason: corrupt, src: out };

  const n = (out.match(/data-kimberley-notes-link=/g) || []).length;
  if (n !== 1) return { ok: false, reason: `notes-count-${n}`, src: out };
  if (/data-kimberley-notes-group=/.test(out)) {
    return { ok: false, reason: "group-present", src: out };
  }
  return { ok: true, src: out };
}
