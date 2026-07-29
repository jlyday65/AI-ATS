/**
 * Shared Kimberley Notes toolbar markup.
 * Notes sits WITH Add candidate (same className), never as a child of the <button>.
 */

import path from "path";

/**
 * Resolve App.jsx path from CLI.
 * Trim FIRST so a leading space from `\` line breaks does not block `~/` expansion.
 */
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

/** Fix known broken Notes inserts before re-wrapping. */
export function healBrokenNotesToolbar(src) {
  let out = String(src);

  // </a>/button>  (Vite: ">" is not valid inside a JSX element)
  out = out.replace(/<\/a>\s*\/button>/gi, "</a></button>");
  // Orphan /button> missing "<"
  out = out.replace(/(^|[^<])\/button>/gi, "$1</button>");
  // <<a → <a
  out = out.replace(/<<+a\b/g, "<a");

  // Notes jammed inside Add candidate button → close button first, leave Notes sibling
  out = out.replace(
    /(Add candidate)\s*(<a\b[\s\S]*?<\/a>)\s*<\/button>/i,
    "$1</button>$2",
  );

  // Exact Mac failure: </span></button> after Notes group
  out = out.replace(
    /(<span\b[^>]*data-kimberley-notes-group=["']1["'][^>]*>[\s\S]*?<\/span>)\s*<\/button>/gi,
    "$1",
  );
  out = out.replace(/<\/span>\s*<\/button>(\s*<\/div>)/gi, "</span>$1");

  // Duplicate closes after a real Add candidate button
  out = out.replace(
    /(Add candidate\s*<\/button>)\s*<\/button>/gi,
    "$1",
  );

  return out;
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
  if (/data-kimberley-notes-link=/i.test(full)) return null;
  if (/<a\b/i.test(full) && /Kimberley Notes/i.test(full)) return null;
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

export function buildNotesLink({ classNameAttr = "", styleBody = "" } = {}) {
  const classLine = classNameAttr ? `\n          ${classNameAttr}` : "";
  const base = styleBody ? `${styleBody},` : "";
  return `<a
          data-kimberley-notes-link="1"
          href="/notes"
          target="_blank"
          rel="noreferrer"${classLine}
          style={{
            ${base}
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            textDecoration: "none",
            cursor: "pointer",
            marginLeft: 0,
            borderTopLeftRadius: 0,
            borderBottomLeftRadius: 0,
            borderLeft: "1px solid rgba(255,255,255,0.28)",
          }}
        >
          Kimberley Notes
        </a>`;
}

export function buildAddCandidateGroup(buttonHtml, classNameAttr = "") {
  const styleBody = extractStyleObjectBody(buttonHtml);
  const notes = buildNotesLink({ classNameAttr, styleBody });
  let btn = buttonHtml;
  if (!/borderTopRightRadius\s*:/.test(btn)) {
    if (/\bstyle=\{\{/.test(btn)) {
      btn = btn.replace(
        /\bstyle=\{\{/,
        "style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0,",
      );
    } else if (!/\bstyle=\{/.test(btn)) {
      btn = btn.replace(
        /^<button\b/i,
        `<button style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}`,
      );
    }
  }

  return `<span
              data-kimberley-notes-group="1"
              style={{
                display: "inline-flex",
                alignItems: "stretch",
                verticalAlign: "middle",
              }}
            >
              ${btn}
              ${notes}
            </span>`;
}

export function stripExistingNotesToolbar(src) {
  let out = src;
  // Unwrap prior groups; also swallow a stray </button> after </span>
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
  out = out.replace(
    /\s*<a\b[^>]*data-kimberley-notes-link=["']1["'][^>]*>[\s\S]*?<\/a>\s*(?:<\/button>)?/gi,
    "",
  );
  out = out.replace(
    /\s*<a\b[^>]*href=["']\/notes["'][^>]*>\s*Kimberley Notes\s*<\/a>\s*(?:<\/button>)?/gi,
    "",
  );
  out = out.replace(/<<+a\b/g, "<a");
  // Orphan </button> left after stripping Notes that had been </a></button>
  out = out.replace(/(Add candidate\s*<\/button>)\s*<\/button>/gi, "$1");
  out = out.replace(/<\/span>\s*<\/button>(\s*<\/div>)/gi, "</span>$1");
  return out;
}

function finalizeToolbar(out) {
  // Never leave </span></button> (Mac Vite: button does not match opening div)
  out = out.replace(
    /(<span\b[^>]*data-kimberley-notes-group=["']1["'][^>]*>[\s\S]*?<\/span>)\s*<\/button>/gi,
    "$1",
  );
  out = out.replace(/<\/span>\s*<\/button>(\s*<\/div>)/gi, "</span>$1");
  out = out.replace(/(Add candidate\s*<\/button>)\s*<\/button>/gi, "$1");
  return out;
}

export function insertNotesWithAddCandidate(src) {
  let out = healBrokenNotesToolbar(src);
  out = stripExistingNotesToolbar(out);
  out = healBrokenNotesToolbar(out);

  const found = extractAddCandidateButton(out);
  if (!found) return { ok: false, reason: "add-candidate-missing", src: out };

  const classNameAttr = extractClassNameAttr(found.attrs);
  const group = buildAddCandidateGroup(found.full, classNameAttr);
  out = out.slice(0, found.index) + group + out.slice(found.end);
  out = finalizeToolbar(out);

  if (/<<a\b/.test(out)) {
    return { ok: false, reason: "double-lt-a", src: out };
  }
  if (/<\/a>\s*\/button>/i.test(out) || /(^|[^<])\/button>/i.test(out)) {
    return { ok: false, reason: "orphan-button-close", src: out };
  }
  if (/<\/span>\s*<\/button>/i.test(out)) {
    return { ok: false, reason: "span-button-mismatch", src: out };
  }
  const n = (out.match(/data-kimberley-notes-link=/g) || []).length;
  if (n !== 1) {
    return { ok: false, reason: `notes-count-${n}`, src: out };
  }
  if ((out.match(/data-kimberley-notes-group=/g) || []).length !== 1) {
    return { ok: false, reason: "group-count", src: out };
  }
  if (/Add candidate\s*<a\b[^>]*data-kimberley-notes-link/i.test(out)) {
    return { ok: false, reason: "notes-inside-button", src: out };
  }
  return { ok: true, src: out };
}
