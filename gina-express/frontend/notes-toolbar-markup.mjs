/**
 * Shared Kimberley Notes toolbar markup.
 * Notes sits WITH Add candidate (same className), never as a child of the <button>.
 */

export function extractAddCandidateButton(src) {
  // Prefer Plus + "Add candidate" pattern (current ATS toolbar)
  const preferred =
    /<button\b([^>]*)>\s*<Plus\b[^>]*\/\s*>\s*Add candidate\s*<\/button>/i;
  let m = src.match(preferred);
  if (m) {
    return {
      full: m[0],
      attrs: m[1] || "",
      index: m.index,
      end: m.index + m[0].length,
    };
  }

  // Fallback: nearest <button>…</button> containing "Add candidate"
  const label = src.search(/Add candidate/i);
  if (label < 0) return null;
  const openRel = src.slice(Math.max(0, label - 400), label).lastIndexOf("<button");
  if (openRel < 0) return null;
  const open = Math.max(0, label - 400) + openRel;
  const closeRel = src.slice(label).search(/<\/button>/i);
  if (closeRel < 0) return null;
  const end = label + closeRel + "</button>".length;
  const full = src.slice(open, end);
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

/** Pull object-literal style={{ ... }} from a button opening tag / attrs. */
export function extractStyleObjectBody(buttonHtml) {
  const m = String(buttonHtml).match(/\bstyle=\{\{([\s\S]*?)\}\}/);
  if (!m) return "";
  return m[1]
    .trim()
    .replace(/,\s*$/, "")
    // Drop corners we inject only on the Add candidate half
    .replace(/\s*borderTopRightRadius\s*:\s*[^,}\n]+,?/g, "")
    .replace(/\s*borderBottomRightRadius\s*:\s*[^,}\n]+,?/g, "")
    .replace(/^\s*,\s*/, "")
    .replace(/,\s*$/, "")
    .trim();
}

/** Build Notes control that mirrors Add candidate chrome. */
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

/** Wrap Add candidate + Notes as one uniform control group. */
export function buildAddCandidateGroup(buttonHtml, classNameAttr = "") {
  const styleBody = extractStyleObjectBody(buttonHtml);
  const notes = buildNotesLink({ classNameAttr, styleBody });
  // Soften right corners on Add candidate so the pair reads as one control
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
  // Unwrap prior groups: keep inner Add candidate button, drop Notes + wrapper
  out = out.replace(
    /\s*<span\b[^>]*data-kimberley-notes-group=["']1["'][^>]*>\s*([\s\S]*?)\s*<\/span>/gi,
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
    /\s*<a\b[^>]*data-kimberley-notes-link=["']1["'][^>]*>[\s\S]*?<\/a>/gi,
    "",
  );
  // Strip accidental <<a from prior broken inserts
  out = out.replace(/<<+a\b/g, "<a");
  return out;
}

export function insertNotesWithAddCandidate(src) {
  let out = stripExistingNotesToolbar(src);
  const found = extractAddCandidateButton(out);
  if (!found) return { ok: false, reason: "add-candidate-missing", src: out };

  const classNameAttr = extractClassNameAttr(found.attrs);
  const group = buildAddCandidateGroup(found.full, classNameAttr);
  out = out.slice(0, found.index) + group + out.slice(found.end);

  if (/<<a\b/.test(out)) {
    return { ok: false, reason: "double-lt-a", src: out };
  }
  const n = (out.match(/data-kimberley-notes-link=/g) || []).length;
  if (n !== 1) {
    return { ok: false, reason: `notes-count-${n}`, src: out };
  }
  if ((out.match(/data-kimberley-notes-group=/g) || []).length !== 1) {
    return { ok: false, reason: "group-count", src: out };
  }
  // Must NOT nest Notes inside the Add candidate button element
  if (/Add candidate\s*<a\b[^>]*data-kimberley-notes-link/i.test(out)) {
    return { ok: false, reason: "notes-inside-button", src: out };
  }
  return { ok: true, src: out };
}
