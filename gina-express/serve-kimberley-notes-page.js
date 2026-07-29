/**
 * Serve the standalone Kimberley Notes HTML page.
 *
 * Mount in server.js (after express() / before SPA fallback):
 *   import { mountKimberleyNotesPage } from "./serve-kimberley-notes-page.js";
 *   mountKimberleyNotesPage(app);
 */

import fs from "fs";
import path from "path";
import express from "express";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function mountKimberleyNotesPage(app) {
  const dist = path.join(__dirname, "frontend", "dist");
  const pub = path.join(__dirname, "frontend", "public");

  try {
    app.use(express.static(dist));
  } catch {
    // ignore
  }
  try {
    app.use(express.static(pub));
  } catch {
    // ignore
  }

  app.get("/kimberley-notes.html", (req, res) => {
    const files = [
      path.join(dist, "kimberley-notes.html"),
      path.join(pub, "kimberley-notes.html"),
    ];
    for (const f of files) {
      try {
        if (fs.existsSync(f)) return res.sendFile(f);
      } catch {
        // continue
      }
    }
    return res
      .status(404)
      .type("text")
      .send(
        "Kimberley Notes HTML missing on server. Deploy frontend/public/kimberley-notes.html and run frontend build.",
      );
  });
}

export default mountKimberleyNotesPage;
