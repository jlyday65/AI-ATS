#!/usr/bin/env node
/**
 * Post-build: harden dist/assets/index-*.js so Jobs Edit cannot crash on
 * o.questions.length even if App.jsx source patterns were missed.
 *
 * Run AFTER npm run build:
 *   node gina-express/frontend/patch-jobs-edit-questions-dist.mjs ~/lyday-gina-backend/gina-backend
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootArg = String(process.argv[2] || "")
  .trim()
  .replace(/^~/, process.env.HOME || "");
if (!rootArg) {
  console.error(
    "Usage: node patch-jobs-edit-questions-dist.mjs ~/lyday-gina-backend/gina-backend",
  );
  process.exit(1);
}

const root = path.resolve(rootArg);
const ginaDir = fs.existsSync(path.join(root, "frontend", "dist", "assets"))
  ? root
  : fs.existsSync(path.join(root, "gina-backend", "frontend", "dist", "assets"))
    ? path.join(root, "gina-backend")
    : root;

const assetsDir = path.join(ginaDir, "frontend", "dist", "assets");
if (!fs.existsSync(assetsDir)) {
  console.error("dist/assets not found:", assetsDir);
  process.exit(2);
}

let patched = 0;
for (const name of fs.readdirSync(assetsDir)) {
  if (!/^index-.*\.js$/.test(name)) continue;
  const fp = path.join(assetsDir, name);
  let js = fs.readFileSync(fp, "utf8");
  const before = js;

  js = js.replace(
    /(?<!\|\|\[\]\)\.)(?<!\|\| \[\]\)\.)\b([A-Za-z_$][\w$]*)\.questions\.length\b/g,
    "($1.questions||[]).length",
  );
  js = js.replace(
    /(?<!\|\|\[\]\)\.)(?<!\|\| \[\]\)\.)\b([A-Za-z_$][\w$]*)\.questions\.map\b/g,
    "($1.questions||[]).map",
  );

  // Minified Job editor: useState(e) → seed questions:[]
  const marker = js.indexOf("Screening questions for this role");
  if (marker > 0) {
    const windowStart = Math.max(0, marker - 3000);
    const slice = js.slice(windowStart, marker);
    const m = slice.match(/\[(\w+),(\w+)\]=(\w+)\.useState\((\w+)\)/);
    if (m && !m[0].includes("questions:Array.isArray")) {
      const at = windowStart + slice.lastIndexOf(m[0]);
      const [state, setState, react, init] = [m[1], m[2], m[3], m[4]];
      const repl = `[${state},${setState}]=${react}.useState({...${init},questions:Array.isArray(${init}.questions)?${init}.questions:[],headcount:Number(${init}.headcount)>0?Number(${init}.headcount):1,description:${init}.description||${init}.jobDescription||"",jobDescription:${init}.jobDescription||${init}.description||""})`;
      js = js.slice(0, at) + repl + js.slice(at + m[0].length);
    }
  }

  if (js !== before) {
    fs.writeFileSync(fp, js, "utf8");
    patched += 1;
    const still = (js.match(/(?<!\|\|\[\]\)\.)\b[A-Za-z_$][\w$]*\.questions\.length\b/g) || [])
      .length;
    console.log("Patched", name, "remaining-unsafe-questions.length≈", still);
  } else {
    console.log("No changes needed:", name);
  }
}

if (!patched) {
  console.warn("No index-*.js bundles were modified. Did npm run build produce dist/assets?");
}

console.log("Done. Dist patches:", patched);
