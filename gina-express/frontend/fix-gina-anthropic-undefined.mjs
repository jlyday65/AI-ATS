#!/usr/bin/env node
/**
 * Fix Railway/chat HTTP 500: {"error":"anthropic is not defined"}
 *
 * After nuclear restore / prompt damage, gina.js often still calls
 * anthropic.messages.create(...) but lost:
 *   import Anthropic from "@anthropic-ai/sdk";
 *   const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
 *
 * ONE LINE:
 *   node gina-express/frontend/fix-gina-anthropic-undefined.mjs ~/lyday-gina-backend/gina-backend
 *
 * Diagnose:
 *   node gina-express/frontend/fix-gina-anthropic-undefined.mjs ~/lyday-gina-backend/gina-backend --diagnose
 *
 * Force re-inject:
 *   node gina-express/frontend/fix-gina-anthropic-undefined.mjs ~/lyday-gina-backend/gina-backend --force
 */

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2).filter(Boolean);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const diagnoseOnly = flags.has("--diagnose") || flags.has("-n");
const force = flags.has("--force");
const pos = args.filter((a) => !a.startsWith("--"));

const raw = String(pos[0] || "")
  .trim()
  .replace(/^~(?=$|\/|\\)/, process.env.HOME || "");
const root = path.resolve(raw);
const ginaDir = fs.existsSync(path.join(root, "gina.js"))
  ? root
  : fs.existsSync(path.join(root, "gina-backend", "gina.js"))
    ? path.join(root, "gina-backend")
    : root;

const ginaPath = path.join(ginaDir, "gina.js");
if (!raw || !fs.existsSync(ginaPath)) {
  console.error(
    "Usage (one line):\n" +
      "  node fix-gina-anthropic-undefined.mjs ~/lyday-gina-backend/gina-backend\n" +
      "  node fix-gina-anthropic-undefined.mjs ~/lyday-gina-backend/gina-backend --diagnose\n" +
      "  node fix-gina-anthropic-undefined.mjs ~/lyday-gina-backend/gina-backend --force",
  );
  process.exit(1);
}

const SKIP_DIR = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  "frontend",
]);

function canParse(file, code) {
  const tmp = `${file}.parse-tmp-${Date.now()}.mjs`;
  fs.writeFileSync(tmp, code, "utf8");
  const r = spawnSync(process.execPath, ["--check", tmp], { encoding: "utf8" });
  try {
    fs.unlinkSync(tmp);
  } catch {
    /* ignore */
  }
  return { ok: r.status === 0, err: (r.stderr || r.stdout || "").trim() };
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function usesAnthropicClient(src) {
  const s = stripComments(src);
  return (
    /\banthropic\.(messages|completions|beta|models)\b/.test(s) ||
    /\bawait\s+anthropic\b/.test(s)
  );
}

function usesAnthropicClass(src) {
  return /\bnew\s+Anthropic\s*\(/.test(stripComments(src));
}

/** Real binding for lowercase `anthropic` client instance. */
function hasAnthropicClientBinding(src) {
  if (/\b(?:const|let|var)\s+anthropic\s*=/.test(src)) return true;
  if (
    /^import\s*\{[^}\n]*\banthropic\b[^}\n]*\}\s*from\s*["'][^"']+["']/m.test(
      src,
    )
  ) {
    return true;
  }
  if (/^import\s+anthropic\s+from\s*["'][^"']+["']/m.test(src)) return true;
  if (
    /(?:const|let|var)\s*\{[^}\n]*\banthropic\b[^}\n]*\}\s*=\s*require\s*\(/.test(
      src,
    )
  ) {
    return true;
  }
  return false;
}

function hasAnthropicImport(src) {
  return (
    /from\s*["']@anthropic-ai\/sdk["']/.test(src) ||
    /require\s*\(\s*["']@anthropic-ai\/sdk["']\s*\)/.test(src) ||
    /from\s*["']anthropic["']/.test(src)
  );
}

function walkJsFiles(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    if (ent.name.startsWith(".") && ent.name !== ".env") continue;
    if (SKIP_DIR.has(ent.name)) continue;
    if (/\.bak/i.test(ent.name) || /\.parse-tmp-/i.test(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walkJsFiles(full, out);
      continue;
    }
    if (!/\.(js|mjs|cjs)$/i.test(ent.name)) continue;
    out.push(full);
  }
  return out;
}

function packageHasAnthropicSdk(dir) {
  const pkgPath = path.join(dir, "package.json");
  if (!fs.existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return Boolean(
      pkg.dependencies?.["@anthropic-ai/sdk"] ||
        pkg.devDependencies?.["@anthropic-ai/sdk"],
    );
  } catch {
    return false;
  }
}

function injectAnthropic(src) {
  const alreadyClient = hasAnthropicClientBinding(src);
  const alreadyImport = hasAnthropicImport(src);
  if (alreadyClient && alreadyImport && !force) {
    return { src, changed: false, reason: "Anthropic import + client already present" };
  }
  if (alreadyClient && !force) {
    return { src, changed: false, reason: "anthropic client binding already present" };
  }

  let next = src;

  // Drop broken / duplicate anthropic client lines when forcing
  if (force) {
    next = next.replace(
      /^import\s+Anthropic\s+from\s*["']@anthropic-ai\/sdk["']\s*;?\s*\n?/gm,
      "",
    );
    next = next.replace(
      /^(?:const|let|var)\s+Anthropic\s*=\s*require\s*\(\s*["']@anthropic-ai\/sdk["']\s*\)\s*;?\s*\n?/gm,
      "",
    );
    next = next.replace(
      /^(?:const|let|var)\s+anthropic\s*=\s*new\s+Anthropic\s*\([\s\S]*?\)\s*;?\s*\n?/gm,
      "",
    );
  }

  const isCjs =
    /\brequire\s*\(/.test(next) && !/^import\s+/m.test(next) && !/\bexport\s+/.test(next);

  const importBlock = isCjs
    ? `const Anthropic = require("@anthropic-ai/sdk");
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || "",
});
`
    : `import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || "",
});
`;

  // If import exists but client missing, only add client
  if (alreadyImport && !alreadyClient && !force) {
    const clientOnly = isCjs
      ? `const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || "",
});
`
      : `const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || "",
});
`;
    if (/^import\s+/m.test(next)) {
      const last = [...next.matchAll(/^import .+$/gm)].pop();
      const idx = last.index + last[0].length;
      next = next.slice(0, idx) + "\n" + clientOnly + next.slice(idx);
    } else if (/require\s*\(\s*["']@anthropic-ai\/sdk["']/.test(next)) {
      next = next.replace(
        /((?:const|let|var)\s+Anthropic\s*=\s*require\s*\(\s*["']@anthropic-ai\/sdk["']\s*\)\s*;?)/,
        `$1\n${clientOnly}`,
      );
    } else {
      next = clientOnly + next;
    }
    return { src: next, changed: true, reason: "added const anthropic = new Anthropic(...)" };
  }

  if (/^import\s+/m.test(next) && !isCjs) {
    const last = [...next.matchAll(/^import .+$/gm)].pop();
    const idx = last.index + last[0].length;
    next = next.slice(0, idx) + "\n" + importBlock + next.slice(idx);
  } else {
    next = importBlock + next;
  }

  return {
    src: next,
    changed: next !== src,
    reason: "added Anthropic import + const anthropic = new Anthropic(...)",
  };
}

function listCallSites(src) {
  const lines = src.split(/\n/);
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (/\banthropic\.(messages|completions|beta|models)\b/.test(lines[i])) {
      hits.push({ line: i + 1, text: lines[i].trim().slice(0, 120) });
    }
  }
  return hits;
}

// --- main ---
console.log("Gina dir:", ginaDir);
console.log("Mode:", diagnoseOnly ? "diagnose" : force ? "force-fix" : "fix");

const hasSdk =
  packageHasAnthropicSdk(ginaDir) ||
  packageHasAnthropicSdk(path.dirname(ginaDir));
if (!hasSdk) {
  console.warn(
    "WARNING: @anthropic-ai/sdk not found in package.json — after import fix run: npm install @anthropic-ai/sdk",
  );
} else {
  console.log("package.json: @anthropic-ai/sdk present");
}

const priority = [
  ginaPath,
  path.join(ginaDir, "server.js"),
  path.join(ginaDir, "chat.js"),
  path.join(ginaDir, "lib", "chat.js"),
  path.join(ginaDir, "routes", "chat.js"),
];
const all = walkJsFiles(ginaDir);
const ordered = [
  ...priority.filter((p) => fs.existsSync(p)),
  ...all.filter((p) => !priority.includes(p)),
];

console.log(`Scanning ${ordered.length} JS files…\n`);

let fixed = 0;
let broken = 0;
const report = [];

for (const file of ordered) {
  let src;
  try {
    src = fs.readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (!usesAnthropicClient(src) && !usesAnthropicClass(src)) continue;

  const rel = path.relative(ginaDir, file);
  const bound = hasAnthropicClientBinding(src);
  const sites = listCallSites(src);
  const status = bound ? "BOUND" : "MISSING CLIENT";
  report.push({ rel, bound, sites: sites.length });

  console.log(`${status}: ${rel} (${sites.length} anthropic.* call site(s))`);
  for (const s of sites.slice(0, 5)) {
    console.log(`    L${s.line}: ${s.text}`);
  }

  if (bound && hasAnthropicImport(src) && !force) {
    console.log("  OK: Anthropic client present\n");
    continue;
  }

  if (!usesAnthropicClient(src) && bound) {
    console.log("  OK: Anthropic constructed but no bare anthropic.* use\n");
    continue;
  }

  const imp = injectAnthropic(src);
  if (!imp.changed) {
    console.log("  SKIP:", imp.reason, "\n");
    if (!bound) broken += 1;
    continue;
  }

  const check = canParse(file, imp.src);
  if (!check.ok) {
    console.error("  REFUSING: fix would not parse");
    console.error("   ", check.err.split("\n")[0]);
    broken += 1;
    console.log("");
    continue;
  }

  if (diagnoseOnly) {
    console.log("  WOULD FIX:", imp.reason, "\n");
    broken += 1;
    continue;
  }

  const bak = `${file}.bak-anthropic-${Date.now()}`;
  fs.copyFileSync(file, bak);
  fs.writeFileSync(file, imp.src, "utf8");
  fixed += 1;
  console.log("  Fixed:", imp.reason);
  console.log("  Backup:", bak, "\n");
}

const gina = fs.readFileSync(ginaPath, "utf8");
const ginaNeeds = usesAnthropicClient(gina) && !hasAnthropicClientBinding(gina);
const ginaParse = canParse(ginaPath, gina);

console.log("──────── summary ────────");
console.log(`files with anthropic usage: ${report.length}`);
console.log(`missing client binding: ${report.filter((r) => !r.bound).length}`);
console.log(`fixed this run: ${fixed}`);
if (diagnoseOnly) console.log("(diagnose only — no files written)");

if (ginaNeeds) {
  console.error("\nFAILED: gina.js still uses anthropic without a client binding");
  process.exit(2);
}
if (!ginaParse.ok) {
  console.error("\nFAILED: gina.js does not parse:", ginaParse.err.split("\n")[0]);
  process.exit(2);
}
if (!diagnoseOnly && broken > 0 && fixed === 0) {
  console.error(
    `\nFAILED: ${broken} file(s) still need anthropic and could not be fixed automatically.`,
  );
  process.exit(2);
}

if (!diagnoseOnly) {
  console.log(`
OK: anthropic client present where needed (fixed ${fixed} file(s)).

If package.json lacked the SDK:
  cd ${ginaDir} && npm install @anthropic-ai/sdk

Next (one line each):
  node --check ${ginaPath}
  cd ~/lyday-gina-backend
  git add -u gina-backend
  git status
  git commit -m "Fix anthropic is not defined in Gina chat"
  git pull origin main --rebase
  git push origin main

Confirm Railway has ANTHROPIC_API_KEY, wait for redeploy, then re-ask Gina to queue Maria.
`);
} else if (report.some((r) => !r.bound)) {
  console.log(`
Re-run without --diagnose to apply:
  node ${path.join(__dirname, "fix-gina-anthropic-undefined.mjs")} ${raw} --force
`);
  process.exit(3);
}
