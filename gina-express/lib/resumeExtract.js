/**
 * Gina-side resume field extraction (plain text).
 * PDF bytes are converted to text in routes/resumes.js via pdf-parse.
 */

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE =
  /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/;
const YEARS_RE =
  /(\d{1,2})\+?\s*(?:years?|yrs?)(?:\s+of)?\s+(?:experience|exp\.?)/i;

const SKILL_LEXICON = [
  "warehouse",
  "wms",
  "inventory",
  "osha",
  "forklift",
  "logistics",
  "supply chain",
  "lean",
  "six sigma",
  "sap",
  "oracle",
  "typescript",
  "javascript",
  "react",
  "node.js",
  "python",
  "java",
  "sql",
  "postgresql",
  "aws",
  "hipaa",
  "epic",
  "leadership",
  "management",
  "operations",
  "distribution",
  "shipping",
  "receiving",
];

function cleanLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function guessName(lines, email) {
  const skip =
    /resume|curriculum|vitae|profile|objective|summary|experience|education|skills|contact/i;
  for (const line of lines.slice(0, 12)) {
    if (skip.test(line)) continue;
    if (EMAIL_RE.test(line) || PHONE_RE.test(line)) continue;
    if (line.length < 3 || line.length > 60) continue;
    if (/https?:\/\//i.test(line)) continue;
    const parts = line.split(/\s+/);
    if (parts.length >= 2 && parts.length <= 5) return line;
  }
  if (email) {
    const local = email.split("@")[0].replace(/[._]+/g, " ");
    return local.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return "Unknown Candidate";
}

export function extractFromResumeText(resumeText) {
  const text = String(resumeText || "").replace(/\u0000/g, "").trim();
  if (!text) throw new Error("Resume text is empty");

  const lines = cleanLines(text);
  const email = text.match(EMAIL_RE)?.[0];
  const phone = text.match(PHONE_RE)?.[0];
  const yearsRaw = text.match(YEARS_RE)?.[1];
  const fullName = guessName(lines, email);
  const lower = text.toLowerCase();
  const skills = SKILL_LEXICON.filter((skill) => lower.includes(skill)).slice(0, 24);

  return {
    fullName,
    email: email || null,
    phone: phone || null,
    skills,
    experienceYears: yearsRaw ? Number(yearsRaw) : null,
    resumeText: text,
  };
}

export async function extractFromPdfBuffer(buffer, fileName = "resume.pdf") {
  if (!buffer?.length) throw new Error(`Empty PDF: ${fileName}`);
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const text = String(result?.text || "").trim();
    if (!text) {
      throw new Error(
        `No extractable text in ${fileName}. For scanned PDFs, paste resume text instead.`,
      );
    }
    return extractFromResumeText(text);
  } finally {
    await parser.destroy?.();
  }
}
