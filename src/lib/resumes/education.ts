export type EducationLine = {
  degree?: string;
  school?: string;
  year?: string | number;
  raw?: string;
};

const DEMO_SCHOOLS = [
  "Georgia State University",
  "University of Georgia",
  "Georgia Tech",
  "Emory University",
  "University of North Carolina",
  "Clemson University",
  "Auburn University",
  "University of South Carolina",
];

const DEMO_DEGREES = [
  "B.S. Business Administration",
  "B.S. Operations Management",
  "B.A. Management",
  "B.S. Industrial Engineering",
  "B.S. Supply Chain Management",
  "A.S. Applied Science",
];

export function buildDemoEducation(seed: number, experienceYears: number) {
  const school = DEMO_SCHOOLS[(seed + 3) % DEMO_SCHOOLS.length];
  const degree = DEMO_DEGREES[(seed + 7) % DEMO_DEGREES.length];
  const gradYear = new Date().getFullYear() - experienceYears - 1 - (seed % 3);
  return { school, degree, gradYear };
}

/** Format structured education lines as a resume EDUCATION block (no header). */
export function formatEducationLines(lines: EducationLine[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (line.raw?.trim()) {
      out.push(line.raw.trim());
      continue;
    }
    const degree = String(line.degree || "").trim();
    const school = String(line.school || "").trim();
    const year = line.year != null && String(line.year).trim() ? String(line.year).trim() : "";
    if (degree && school) out.push(`${degree} — ${school}`);
    else if (degree || school) out.push(degree || school);
    if (year) out.push(`Graduated ${year}`);
  }
  return out.filter(Boolean);
}

/** Pull EDUCATION body lines from an existing resume blob. */
export function parseEducationFromResumeText(resumeText: string): string[] {
  const text = String(resumeText || "");
  if (!text.trim()) return [];
  const match = text.match(
    /(?:^|\n)\s*EDUCATION\s*\n([\s\S]*?)(?=\n\s*(?:SKILLS|EXPERIENCE|SUMMARY|CERTIFICATIONS|PROJECTS|AWARDS)\s*\n|$)/i,
  );
  if (!match) return [];
  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^[-–—•]+$/.test(line));
}

/** Flatten provider education arrays (PDL / Coresignal / Bright Data shapes). */
export function educationFromProviderRow(row: Record<string, unknown>): EducationLine[] {
  const buckets: unknown[] = [];
  for (const key of [
    "education",
    "educations",
    "education_history",
    "schools",
    "degrees",
  ]) {
    if (Array.isArray(row[key])) buckets.push(...(row[key] as unknown[]));
  }

  const lines: EducationLine[] = [];
  for (const item of buckets) {
    if (typeof item === "string" && item.trim()) {
      lines.push({ raw: item.trim() });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const edu = item as Record<string, unknown>;
    const schoolObj =
      edu.school && typeof edu.school === "object"
        ? (edu.school as Record<string, unknown>)
        : null;
    const school = String(
      edu.school_name ||
        edu.schoolName ||
        edu.institution ||
        edu.university ||
        schoolObj?.name ||
        edu.school ||
        "",
    ).trim();
    const degrees = Array.isArray(edu.degrees)
      ? edu.degrees.map(String).filter(Boolean)
      : [];
    const majors = Array.isArray(edu.majors)
      ? edu.majors.map(String).filter(Boolean)
      : Array.isArray(edu.majors_list)
        ? edu.majors_list.map(String).filter(Boolean)
        : [];
    const degree =
      String(edu.degree || edu.degree_name || edu.title || "").trim() ||
      degrees[0] ||
      (majors[0] ? majors[0] : "");
    const majorExtra = majors.filter((m) => m !== degree).slice(0, 2);
    const degreeLine = [degree, majorExtra.length ? `(${majorExtra.join(", ")})` : ""]
      .filter(Boolean)
      .join(" ");
    const year =
      edu.end_date ||
      edu.endDate ||
      edu.graduation_year ||
      edu.grad_year ||
      edu.year ||
      edu.date_to ||
      "";
    const yearStr =
      typeof year === "string" || typeof year === "number"
        ? String(year).slice(0, 4)
        : "";
    if (degreeLine || school) {
      lines.push({
        degree: degreeLine || undefined,
        school: school || undefined,
        year: yearStr || undefined,
      });
    }
  }

  // Single-field fallbacks on the person row
  const singleSchool = String(
    row.school || row.university || row.education_school || "",
  ).trim();
  const singleDegree = String(
    row.degree || row.education_degree || "",
  ).trim();
  if (!lines.length && (singleSchool || singleDegree)) {
    lines.push({ degree: singleDegree || undefined, school: singleSchool || undefined });
  }

  return lines.slice(0, 4);
}

export function educationTextFromLines(lines: EducationLine[]): string {
  return formatEducationLines(lines).join("\n").trim();
}

/**
 * Ensure resumeText contains an EDUCATION section before SKILLS.
 * Uses provider lines when present; otherwise synthesizes a demo-style
 * degree/school (same approach as buildDemoResumeText) so ATS resumes
 * always show Education again.
 */
export function ensureEducationInResumeText(input: {
  resumeText: string;
  educationLines?: EducationLine[];
  educationText?: string;
  seed?: number;
  experienceYears?: number;
  fullName?: string;
}): { resumeText: string; educationText: string } {
  const existing = parseEducationFromResumeText(input.resumeText);
  let body = formatEducationLines(input.educationLines || []);
  if (!body.length && input.educationText?.trim()) {
    body = input.educationText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  }
  if (!body.length && existing.length) body = existing;

  if (!body.length) {
    const years = input.experienceYears ?? 5;
    const seed =
      input.seed ??
      Array.from(String(input.fullName || "candidate")).reduce(
        (n, ch) => n + ch.charCodeAt(0),
        0,
      );
    const { school, degree, gradYear } = buildDemoEducation(seed, years);
    body = [`${degree} — ${school}`, `Graduated ${gradYear}`];
  }

  const educationText = body.join("\n");
  let resumeText = String(input.resumeText || "").trim();

  if (/^EDUCATION$/m.test(resumeText) || /\nEDUCATION\n/i.test(resumeText)) {
    // Replace existing EDUCATION block body
    resumeText = resumeText.replace(
      /((?:^|\n)\s*EDUCATION\s*\n)([\s\S]*?)(?=\n\s*(?:SKILLS|EXPERIENCE|SUMMARY|CERTIFICATIONS|PROJECTS|AWARDS)\s*\n|$)/i,
      `$1${educationText}\n`,
    );
    return { resumeText: resumeText.trim(), educationText };
  }

  const block = `\n\nEDUCATION\n${educationText}\n`;
  if (/\nSKILLS\n/i.test(resumeText)) {
    resumeText = resumeText.replace(/\nSKILLS\n/i, `${block}\nSKILLS\n`);
  } else {
    resumeText = `${resumeText}${block}`;
  }
  return { resumeText: resumeText.trim(), educationText };
}
