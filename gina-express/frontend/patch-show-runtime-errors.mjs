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
  function formatErr(err, fallback) {
    if (!err) return fallback || "unknown error";
    if (typeof err === "string") return err;
    var name = err.name || "Error";
    var msg = err.message || "";
    var stack = err.stack || "";
    // Safari stacks often omit the message — put it first explicitly.
    if (msg && stack.indexOf(msg) === -1) {
      return name + ": " + msg + "\\n\\n" + stack;
    }
    return stack || (name + ": " + msg) || fallback || "unknown error";
  }
  window.addEventListener("error", function (ev) {
    paint(
      formatErr(ev && ev.error, null) ||
        (ev && ev.message) ||
        "window.error",
    );
  });
  window.addEventListener("unhandledrejection", function (ev) {
    paint(formatErr(ev && ev.reason, "unhandledrejection"));
  });
  setTimeout(function () {
    var root = document.getElementById("root");
    if (root && !root.childElementCount && !document.getElementById("__gina_runtime_error")) {
      var scripts = Array.prototype.slice.call(document.scripts || []).map(function (s) {
        return s.src || "(inline)";
      });
      paint(
        "React never mounted (#root is empty).\\n\\n" +
          "Usually /assets/*.js returned the Sign In HTML instead of JavaScript.\\n" +
          "Open the JS URL below in a new tab — you must see code, not a password form.\\n\\n" +
          "Scripts:\\n" +
          (scripts.join("\\n") || "(none)") +
          "\\n\\nFix: node gina-express/frontend/fix-assets-auth-block.mjs ~/lyday-gina-backend/gina-backend",
      );
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
  // Upgrade older banners that omit Error.message (Safari stacks are message-less).
  if (html.includes("__gina_runtime_error")) {
    if (html.includes("function formatErr")) {
      console.log("Already patched:", file);
      continue;
    }
    html = html.replace(
      /<script>\s*\(function\s*\(\)\s*\{\s*function paint\(msg\)[\s\S]*?<\/script>/,
      SNIPPET,
    );
    if (!html.includes("function formatErr")) {
      console.warn("Could not upgrade crash banner in", file);
      continue;
    }
    fs.writeFileSync(file, html, "utf8");
    console.log("Upgraded crash banner:", file);
    wrote += 1;
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
