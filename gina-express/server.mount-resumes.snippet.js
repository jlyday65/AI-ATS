/**
 * In Gina server.js — mount the resumes router AFTER requireAppAuth.
 *
 * 1) npm install multer pdf-parse
 * 2) Copy:
 *      routes/resumes.js
 *      lib/resumeExtract.js
 * 3) Add the import + app.use lines below.
 */

/*
import resumesRouter from "./routes/resumes.js";

// near other routers, after app.use(requireAppAuth):
app.use("/resumes", resumesRouter);
*/
