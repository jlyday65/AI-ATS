/**
 * Serve the standalone Kimberley Notes HTML page.
 *
 * Mount in server.js (after express() / before SPA fallback):
 *   import { mountKimberleyNotesPage } from "./serve-kimberley-notes-page.js";
 *   mountKimberleyNotesPage(app);
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function firstExisting(files) {
  for (const f of files) {
    try {
      if (fs.existsSync(f)) return f;
    } catch {
      // ignore
    }
  }
  return null;
}

export function mountKimberleyNotesPage(app) {
  const dist = path.join(__dirname, "frontend", "dist");
  const pub = path.join(__dirname, "frontend", "public");

  // Prefer dist (production build), fall back to public
  try {
    app.use(expressStaticSafe(dist));
  } catch {
    // ignore
  }
  try {
    app.use(expressStaticSafe(pub));
  } catch {
    // ignore
  }

  app.get("/kimberley-notes.html", (req, res) => {
    const file = firstExisting([
      path.join(dist, "kimberley-notes.html"),
      path.join(pub, "kimberley-notes.html"),
    ]);
    if (!file) {
      return res
        .status(404)
        .type("text")
        .send(
          "Kimberley Notes HTML missing on server. Deploy frontend/public/kimberley-notes.html and run frontend build.",
        );
    }
    return res.sendFile(file);
  });
}

function expressStaticSafe(dir) {
  // Lazy require/import style via dynamic — use express from caller's app by returning middleware factory
  // Callers typically already have express; we import it here.
  return asyncHandlerStatic(dir);
}

import express from "express";
function asyncHandlerStatic(dir) {
  return express.static(dir);
}

export default mountKimberleyNotesPage;
