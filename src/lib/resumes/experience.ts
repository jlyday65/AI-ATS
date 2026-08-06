export type ExperienceLine = {
  title?: string;
  company?: string;
  startDate?: string;
  endDate?: string;
  summary?: string;
  location?: string;
  raw?: string;
};

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return undefined;
}

function yearMonth(value: unknown): string {
  const raw = firstString(value);
  if (!raw) return "";
  // PDL dates are often YYYY-MM or YYYY-MM-DD
  const m = raw.match(/^(\d{4})(?:-(\d{2}))?/);
  if (!m) return raw.slice(0, 10);
  return m[2] ? `${m[1]}-${m[2]}` : m[1];
}

/** Format structured experience lines as resume EXPERIENCE body (no header). */
export function formatExperienceLines(lines: ExperienceLine[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (line.raw?.trim()) {
      out.push(line.raw.trim());
      continue;
    }
    const title = String(line.title || "").trim();
    const company = String(line.company || "").trim();
    const start = yearMonth(line.startDate);
    const end = yearMonth(line.endDate) || (start ? "Present" : "");
    const dates =
      start && end ? `${start} – ${end}` : start || end || "";
    const headline = [title || "Role", company ? `— ${company}` : ""]
      .filter(Boolean)
      .join(" ");
    if (headline.trim()) out.push(headline);
    if (dates) out.push(dates);
    if (line.location?.trim()) out.push(line.location.trim());
    if (line.summary?.trim()) out.push(line.summary.trim());
    if (headline.trim() || dates || line.summary?.trim()) out.push("");
  }
  while (out.length && !out[out.length - 1]?.trim()) out.pop();
  return out;
}

/**
 * Flatten provider experience / job history arrays
 * (People Data Labs, Coresignal, Bright Data shapes).
 */
export function experienceFromProviderRow(
  row: Record<string, unknown>,
): ExperienceLine[] {
  const buckets: unknown[] = [];
  for (const key of [
    "experience",
    "experiences",
    "job_history",
    "jobs",
    "positions",
    "work_experience",
  ]) {
    if (Array.isArray(row[key])) buckets.push(...(row[key] as unknown[]));
  }

  const lines: ExperienceLine[] = [];
  for (const item of buckets) {
    if (typeof item === "string" && item.trim()) {
      lines.push({ raw: item.trim() });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const exp = item as Record<string, unknown>;
    const titleObj =
      exp.title && typeof exp.title === "object"
        ? (exp.title as Record<string, unknown>)
        : null;
    const companyObj =
      exp.company && typeof exp.company === "object"
        ? (exp.company as Record<string, unknown>)
        : null;
    const title = firstString(
      titleObj?.name,
      exp.title_name,
      exp.job_title,
      exp.position,
      typeof exp.title === "string" ? exp.title : undefined,
      exp.role,
    );
    const company = firstString(
      companyObj?.name,
      exp.company_name,
      exp.organization,
      typeof exp.company === "string" ? exp.company : undefined,
      exp.employer,
    );
    const startDate = firstString(
      exp.start_date,
      exp.startDate,
      exp.from,
      exp.date_from,
    );
    const endDate = firstString(
      exp.end_date,
      exp.endDate,
      exp.to,
      exp.date_to,
    );
    const summary = firstString(
      exp.summary,
      exp.description,
      exp.job_summary,
    );
    const locationNames = Array.isArray(exp.location_names)
      ? exp.location_names.map(String).filter(Boolean)
      : [];
    const location = firstString(
      locationNames[0],
      exp.location,
      companyObj && typeof companyObj.location === "object"
        ? (companyObj.location as Record<string, unknown>).name
        : undefined,
    );
    if (title || company || summary) {
      lines.push({
        title,
        company,
        startDate,
        endDate,
        summary,
        location,
      });
    }
  }

  // Current-role fallback when history arrays are empty
  if (!lines.length) {
    const title = firstString(
      row.job_title,
      row.title,
      row.headline,
      row.active_experience_title,
    );
    const company = firstString(
      row.job_company_name,
      row.company_name,
      row.company,
    );
    if (title || company) {
      lines.push({ title, company });
    }
  }

  return lines.slice(0, 12);
}

export function experienceTextFromLines(lines: ExperienceLine[]): string {
  return formatExperienceLines(lines).join("\n").trim();
}

/**
 * True when resumeText contains a non-empty EXPERIENCE section.
 * Maria uses this as a hard gate — work history mapping is not optional.
 */
export function hasMappedWorkHistory(resumeText: string): boolean {
  const text = String(resumeText || "");
  // Use [ \t]* (not \s*) after the header so blank lines stay in the body
  // instead of being eaten before the capture starts.
  const match = text.match(
    /(?:^|\n)[ \t]*EXPERIENCE[ \t]*\n([\s\S]*?)(?=\n[ \t]*(?:SKILLS|EDUCATION|SUMMARY|CERTIFICATIONS|PROJECTS|AWARDS)[ \t]*\n|$)/i,
  );
  if (!match) return false;
  const body = match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      if (!line || /^[-–—•]+$/.test(line)) return false;
      // Never treat the next section header as experience content.
      if (
        /^(SKILLS|EDUCATION|SUMMARY|CERTIFICATIONS|PROJECTS|AWARDS)\b/i.test(
          line,
        )
      ) {
        return false;
      }
      return true;
    });
  if (!body.length) return false;
  // Reject placeholder-only shells that look like "no resume" on the Board.
  const joined = body.join(" ").trim();
  if (joined.length < 8) return false;
  if (/^see (people data labs|linkedin|coresignal)/i.test(joined)) return false;
  return true;
}

/** Resume text is long enough and includes mapped work history. */
export function hasUsableResumeWithWorkHistory(resumeText: string): boolean {
  const text = String(resumeText || "").trim();
  return text.length >= 80 && hasMappedWorkHistory(text);
}
