import { coresignalApiKey } from "@/lib/people-sourcing/env";
import type {
  PeopleProviderResult,
  PeopleSearchQuery,
} from "@/lib/people-sourcing/types";
import {
  educationFromProviderRow,
  ensureEducationInResumeText,
} from "@/lib/resumes/education";
import {
  experienceFromProviderRow,
  experienceTextFromLines,
} from "@/lib/resumes/experience";
import type { CandidateProfile } from "@/lib/types";

const PREVIEW_URL =
  "https://api.coresignal.com/cdapi/v2/employee_multi_source/search/es_dsl/preview";

function buildEsQuery(query: PeopleSearchQuery) {
  const must: Array<Record<string, unknown>> = [];
  const title = query.job.title.trim();
  if (title) {
    must.push({
      multi_match: {
        query: title,
        fields: ["headline", "job_title", "summary", "title"],
      },
    });
  }
  if (query.job.location?.trim()) {
    must.push({
      multi_match: {
        query: query.job.location.trim(),
        fields: ["location_full", "location", "location_country"],
      },
    });
  }
  for (const skill of [
    ...query.job.requiredSkills,
    ...query.job.preferredSkills,
  ].slice(0, 6)) {
    const value = skill.trim();
    if (!value) continue;
    must.push({
      multi_match: {
        query: value,
        fields: ["skills", "summary", "headline"],
      },
    });
  }
  if (!must.length) {
    must.push({ match_all: {} });
  }
  return { query: { bool: { must } } };
}

function asArray(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object",
    );
  }
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    for (const key of ["results", "data", "hits", "employees"]) {
      if (Array.isArray(obj[key])) return asArray(obj[key]);
    }
  }
  return [];
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function mapCandidate(
  row: Record<string, unknown>,
  index: number,
  jobId: string,
): CandidateProfile {
  const id = String(row.id ?? row.employee_id ?? index);
  const fullName = String(
    row.full_name ?? row.name ?? `Coresignal Candidate ${index + 1}`,
  );
  const headline = firstString(
    row.headline,
    row.active_experience_title,
    row.job_title,
    row.title,
  );
  const location = firstString(
    row.location_full,
    row.location,
    row.location_country,
  );
  const company = firstString(row.company_name);
  const profileUrl =
    firstString(row.linkedin_url, row.profile_url) ||
    `https://example.com/coresignal/${id}`;
  const skillsRaw = row.skills;
  const skills = Array.isArray(skillsRaw)
    ? skillsRaw.map(String).slice(0, 12)
    : typeof skillsRaw === "string"
      ? skillsRaw.split(/[,|;]/).map((s) => s.trim()).filter(Boolean).slice(0, 12)
      : [];
  if (company && !skills.includes(company)) {
    // Keep company as a light signal when skills aren't in preview payload.
  }
  const summary = firstString(row.summary, row.headline);
  const experienceYears =
    typeof row.experience_years === "number"
      ? row.experience_years
      : typeof row.total_experience_years === "number"
        ? row.total_experience_years
        : undefined;
  const managementLevel = firstString(row.active_experience_management_level);
  const department = firstString(row.active_experience_department);
  const educationLines = educationFromProviderRow(row);
  const experienceLines = experienceFromProviderRow(row);
  const experienceBody =
    experienceTextFromLines(experienceLines) ||
    [
      headline || "Role",
      company ? `— ${company}` : "",
      department ? `(${department})` : "",
      managementLevel ? `· ${managementLevel}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  const baseResume = [
    fullName,
    headline || "",
    company || "",
    location || "",
    profileUrl,
    "",
    "SUMMARY",
    summary ||
      `Professional with overlap for the open role${company ? ` (current: ${company})` : ""}.`,
    "",
    "EXPERIENCE",
    experienceBody,
    "",
    "SKILLS",
    skills.join(", ") || "see LinkedIn / Coresignal profile",
  ].join("\n");
  const { resumeText, educationText } = ensureEducationInResumeText({
    resumeText: baseResume,
    educationLines,
    experienceYears,
    fullName,
    seed: Array.from(id).reduce((n, ch) => n + ch.charCodeAt(0), 0),
  });

  return {
    id: `cand_coresignal_${jobId}_${id}`,
    fullName,
    headline: company && headline ? `${headline} @ ${company}` : headline,
    location,
    email: row.email ? String(row.email) : undefined,
    skills,
    experienceYears,
    education: educationText,
    platforms: [
      {
        platformId: "coresignal",
        profileUrl,
        handle: fullName.toLowerCase().replace(/\s+/g, "."),
      },
      {
        platformId: "linkedin",
        profileUrl,
        handle: fullName.toLowerCase().replace(/\s+/g, "."),
      },
    ],
    summary:
      summary ||
      [
        headline || "Professional",
        company ? `at ${company}` : null,
        location ? `· ${location}` : null,
      ]
        .filter(Boolean)
        .join(" "),
    resumeText,
    sourceSignals: [
      "Coresignal Multi-source Employee API",
      company ? `Current company: ${company}` : "Profile match",
      managementLevel || (skills[0] ? `Skill signal: ${skills[0]}` : "Headline match"),
      experienceYears != null ? `${experienceYears}+ years` : "Experience on file",
    ],
  };
}

/**
 * Coresignal Multi-source Employee API (search preview).
 * Docs: https://docs.coresignal.com/employee-api/multi-source-employee-api
 */
export async function searchCoresignalPeople(
  query: PeopleSearchQuery,
): Promise<PeopleProviderResult> {
  const started = Date.now();
  const apiKey = coresignalApiKey();
  if (!apiKey) {
    return {
      provider: "coresignal",
      mode: "skipped",
      candidates: [],
      error: "CORESIGNAL_API_KEY not set",
      latencyMs: Date.now() - started,
    };
  }

  try {
    const limit = Math.min(query.limit ?? 18, 40);
    const response = await fetch(
      `${PREVIEW_URL}?items_per_page=${limit}`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
          apikey: apiKey,
        },
        body: JSON.stringify(buildEsQuery(query)),
      },
    );
    const text = await response.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    if (!response.ok) {
      return {
        provider: "coresignal",
        mode: "error",
        candidates: [],
        error: `Coresignal Employee HTTP ${response.status}: ${text.slice(0, 240)}`,
        latencyMs: Date.now() - started,
      };
    }
    const rows = asArray(payload).slice(0, limit);
    return {
      provider: "coresignal",
      mode: "live",
      candidates: rows.map((row, index) =>
        mapCandidate(row, index, query.job.id),
      ),
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    return {
      provider: "coresignal",
      mode: "error",
      candidates: [],
      error:
        error instanceof Error ? error.message : "Coresignal Employee failed",
      latencyMs: Date.now() - started,
    };
  }
}
