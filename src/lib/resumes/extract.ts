import { randomUUID } from "crypto";

export interface ExtractedResume {
  fullName: string;
  email?: string;
  phone?: string;
  location?: string;
  headline?: string;
  skills: string[];
  experienceYears?: number;
  resumeText: string;
}

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
  "azure",
  "hipaa",
  "epic",
  "leadership",
  "management",
  "operations",
  "distribution",
  "shipping",
  "receiving",
  "cycle count",
  "kpi",
];

function cleanLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function guessName(lines: string[], email?: string): string {
  const skip =
    /resume|curriculum|vitae|profile|objective|summary|experience|education|skills|contact/i;
  for (const line of lines.slice(0, 12)) {
    if (skip.test(line)) continue;
    if (EMAIL_RE.test(line) || PHONE_RE.test(line)) continue;
    if (line.length < 3 || line.length > 60) continue;
    if (/https?:\/\//i.test(line)) continue;
    // Prefer 2–4 capitalized tokens
    const parts = line.split(/\s+/);
    if (parts.length >= 2 && parts.length <= 5 && /^[A-Za-z][A-Za-z.'-]*$/.test(parts[0])) {
      return line;
    }
  }
  if (email) {
    const local = email.split("@")[0].replace(/[._]+/g, " ");
    return local.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return `Candidate ${randomUUID().slice(0, 6)}`;
}

function extractSkills(text: string): string[] {
  const lower = text.toLowerCase();
  const hits = SKILL_LEXICON.filter((skill) => lower.includes(skill));
  return [...new Set(hits)].slice(0, 24);
}

function extractHeadline(lines: string[], fullName: string): string | undefined {
  for (const line of lines.slice(0, 15)) {
    if (line === fullName) continue;
    if (EMAIL_RE.test(line) || PHONE_RE.test(line)) continue;
    if (/summary|objective|experience/i.test(line)) continue;
    if (line.length >= 8 && line.length <= 90) return line;
  }
  return undefined;
}

function extractLocation(lines: string[]): string | undefined {
  const loc = lines.find((line) =>
    /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)*),\s*[A-Z]{2}\b/.test(line),
  );
  const match = loc?.match(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)*),\s*[A-Z]{2}\b/);
  return match?.[0];
}

/** Parse plain resume text into structured fields. */
export function extractFromResumeText(resumeText: string): ExtractedResume {
  const text = resumeText.replace(/\u0000/g, "").trim();
  if (!text) {
    throw new Error("Resume text is empty");
  }

  const lines = cleanLines(text);
  const email = text.match(EMAIL_RE)?.[0];
  const phone = text.match(PHONE_RE)?.[0];
  const yearsRaw = text.match(YEARS_RE)?.[1];
  const fullName = guessName(lines, email);

  return {
    fullName,
    email,
    phone,
    location: extractLocation(lines),
    headline: extractHeadline(lines, fullName),
    skills: extractSkills(text),
    experienceYears: yearsRaw ? Number(yearsRaw) : undefined,
    resumeText: text,
  };
}

/** Extract text from a PDF buffer, then parse fields. */
export async function extractFromPdfBuffer(
  buffer: Buffer,
  fileName = "resume.pdf",
): Promise<ExtractedResume> {
  if (!buffer?.length) {
    throw new Error(`Empty PDF: ${fileName}`);
  }

  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const text = String(result?.text || "").trim();
    if (!text) {
      throw new Error(
        `No extractable text in ${fileName}. Scanned image PDFs need OCR (not enabled yet) — paste text instead.`,
      );
    }
    return extractFromResumeText(text);
  } finally {
    await parser.destroy?.();
  }
}
