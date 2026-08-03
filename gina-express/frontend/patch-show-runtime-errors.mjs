#!/usr/bin/env node
/**
 * Replace blank white screens with a visible red error banner.
 * Patches frontend/index.html (and dist/index.html if present).
 *
 *   node gina-express/frontend/patch-show-runtime-errors.mjs ~/lyday-gina-backend/gina-backend
 */
import fs from "fs";
import path from "path";

const rootArg = String(process.argv[2] || "")
  .trim()
  .replace(/^~/, process.env.HOME || "");
if (!rootArg) {
  console.error(
    "Usage: node patch-show-runtime-errors.mjs ~/lyday-gina-backend/gina-backend",
  );
  process.exit(1);
}

const root = path.resolve(rootArg);
const ginaDir = fs.existsSync(path.join(root, "frontend", "index.html"))
  ? root
  : fs.existsSync(path.join(root, "gina-backend", "frontend", "index.html"))
    ? path.join(root, "gina-backend")
    : fs.existsSync(path.join(root, "frontend", "src", "main.jsx"))
      ? root
      : fs.existsSync(path.join(root, "gina-backend", "frontend", "src", "main.jsx"))
        ? path.join(root, "gina-backend")
        : root;

const SNIPPET = `
<script>
(function () {
  function paint(msg) {
    try {
      var el = document.getElementById("__gina_runtime_error");
      if (!el) {
        el = document.createElement("pre");
        el.id = "__gina_runtime_error";
        el.setAttribute("style",
          "position:fixed;inset:0;z-index:2147483647;margin:0;padding:24px;" +
          "background:#1a0a0a;color:#ffb4b4;font:14px/1.45 ui-monospace,Menlo,monospace;" +
          "white-space:pre-wrap;overflow:auto;");
        (document.body || document.documentElement).appendChild(el);
      }
      el.textContent = "ATS crashed — copy this to Cursor:\\n\\n" + String(msg || "unknown error");
    } catch (e) {}
  }
  window.addEventListener("error", function (ev) {
    paint((ev && ev.error && (ev.error.stack || ev.error.message)) || (ev && ev.message) || "window.error");
  });
  window.addEventListener("unhandledrejection", function (ev) {
    var r = ev && ev.reason;
    paint((r && (r.stack || r.message)) || r || "unhandledrejection");
  });
  setTimeout(function () {
    var root = document.getElementById("root");
    if (root && !root.childElementCount && !document.getElementById("__gina_runtime_error")) {
      paint("React never mounted (#root is empty). Check the Console and the JS bundle failed to load.");
    }
  }, 2500);
})();
</script>
`.trim();

const targets = [
  path.join(ginaDir, "frontend", "index.html"),
  path.join(ginaDir, "frontend", "dist", "index.html"),
  path.join(ginaDir, "frontend", "public", "index.html"),
];

let wrote = 0;
for (const file of targets) {
  if (!fs.existsSync(file)) continue;
  let html = fs.readFileSync(file, "utf8");
  if (html.includes("__gina_runtime_error")) {
    console.log("Already patched:", file);
    continue;
  }
  if (/<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, `${SNIPPET}\n</head>`);
  } else if (/<body[^>]*>/i.test(html)) {
    html = html.replace(/<body[^>]*>/i, (m) => `${m}\n${SNIPPET}`);
  } else {
    html = SNIPPET + "\n" + html;
  }
  fs.writeFileSync(file, html, "utf8");
  console.log("Patched", file);
  wrote += 1;
}

// Also wrap main.jsx createRoot if present
for (const rel of [
  "frontend/src/main.jsx",
  "frontend/src/main.tsx",
  "frontend/src/index.jsx",
]) {
  const mainPath = path.join(ginaDir, rel);
  if (!fs.existsSync(mainPath)) continue;
  let src = fs.readFileSync(mainPath, "utf8");
  if (src.includes("__gina_runtime_error") || src.includes("ATS crashed")) {
    console.log("main already guarded:", mainPath);
    continue;
  }
  if (!/createRoot\s*\(/.test(src)) continue;
  const bak = `${mainPath}.bak-errguard-${Date.now()}`;
  fs.copyFileSync(mainPath, bak);
  src =
    src.trimEnd() +
    `

// Visible crash banner (prevents silent white screen)
if (typeof window !== "undefined") {
  window.addEventListener("error", (ev) => {
    const msg = ev?.error?.stack || ev?.message || "window.error";
    console.error(msg);
  });
}
`;
  fs.writeFileSync(mainPath, src, "utf8");
  console.log("Guarded", mainPath, "backup", bak);
  wrote += 1;
}

if (!wrote) {
  console.warn("No index.html/main.jsx found to patch under", ginaDir);
  process.exit(2);
}
console.log("OK: next white screen should show the red error text instead of blank.");
