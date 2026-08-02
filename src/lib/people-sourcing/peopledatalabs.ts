import { peopleDataLabsApiKey } from "@/lib/people-sourcing/env";
import type {
  PeopleProviderResult,
  PeopleSearchQuery,
} from "@/lib/people-sourcing/types";
import type { CandidateProfile } from "@/lib/types";

const SEARCH_URL = "https://api.peopledatalabs.com/v5/person/search";

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const hit = value.find((item) => typeof item === "string" && item.trim());
      if (typeof hit === "string") return hit.trim();
    }
  }
  return undefined;
}

function buildQuery(query: PeopleSearchQuery) {
  const must: Array<Record<string, unknown>> = [];
  const title = query.job.title.trim();
  if (title) {
    must.push({
      match: {
        job_title: title,
      },
    });
  }

  const location = (query.job.location || "").trim();
  if (location && !/remote/i.test(location)) {
    const city = location.split(",")[0]?.trim();
    if (city) {
      must.push({
        bool: {
          should: [
            { match: { location_name: location } },
            { match: { location_locality: city } },
            { match: { location_region: location } },
          ],
          minimum_should_match: 1,
        },
      });
    }
  }

  for (const skill of [
    ...query.job.requiredSkills,
    ...query.job.preferredSkills,
  ].slice(0, 6)) {
    const value = skill.trim();
    if (!value) continue;
    must.push({
      term: {
        skills: value.toLowerCase(),
      },
    });
  }

  if (!must.length) {
    must.push({ exists: { field: "full_name" } });
  }

  return {
    size: Math.min(query.limit ?? 18, 25),
    dataset: "resume",
    query: {
      bool: { must },
    },
  };
}

function asPeople(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  if (Array.isArray(obj.data)) {
    return obj.data.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object",
    );
  }
  return [];
}

function mapCandidate(
  row: Record<string, unknown>,
  index: number,
  jobId: string,
): CandidateProfile {
  const id = String(row.id || row.linkedin_id || index);
  const fullName =
    firstString(row.full_name, row.name) || `PDL Candidate ${index + 1}`;
  const headline = firstString(
    row.job_title,
    row.headline,
    row.job_title_role,
  );
  const company = firstString(row.job_company_name, row.job_company_website);
  const location = firstString(
    row.location_name,
    row.location_locality,
    row.location_metro,
  );
  const emails = Array.isArray(row.emails)
    ? row.emails
        .map((item) =>
          typeof item === "string"
            ? item
            : item && typeof item === "object"
              ? String((item as { address?: string }).address || "")
              : "",
        )
        .filter(Boolean)
    : [];
  const email = firstString(row.work_email, emails[0], row.recommended_personal_email);
  const phones = Array.isArray(row.phone_numbers)
    ? row.phone_numbers.map(String).filter(Boolean)
    : [];
  const skills = Array.isArray(row.skills)
    ? row.skills.map(String).slice(0, 16)
    : [];
  const summary = firstString(row.summary, row.job_summary);
  const profileUrl =
    firstString(row.linkedin_url, row.linkedin_username) ||
    (typeof row.linkedin_username === "string"
      ? `https://www.linkedin.com/in/${row.linkedin_username}`
      : `https://www.peopledatalabs.com/person/${id}`);
  const linkedinUrl = profileUrl.includes("linkedin.com")
    ? profileUrl
    : firstString(row.linkedin_url);

  const experienceYears =
    typeof row.inferred_years_experience === "number"
      ? row.inferred_years_experience
      : undefined;

  return {
    id: `cand_pdl_${jobId}_${id}`,
    fullName,
    headline: company && headline ? `${headline} @ ${company}` : headline,
    location,
    email,
    phone: phones[0],
    skills,
    experienceYears,
    platforms: [
      {
        platformId: "peopledatalabs",
        profileUrl,
        handle: fullName.toLowerCase().replace(/\s+/g, "."),
      },
      ...(linkedinUrl
        ? [
            {
              platformId: "linkedin",
              profileUrl: linkedinUrl,
              handle: fullName.toLowerCase().replace(/\s+/g, "."),
            },
          ]
        : []),
    ],
    summary:
      summary ||
      [headline || "Professional", company ? `at ${company}` : null, location ? `· ${location}` : null]
        .filter(Boolean)
        .join(" "),
    resumeText: [
      fullName,
      headline || "",
      company || "",
      location || "",
      email || "",
      profileUrl,
      "",
      "SUMMARY",
      summary ||
        `People Data Labs profile with overlap for the open role${company ? ` (current: ${company})` : ""}.`,
      "",
      "EXPERIENCE",
      [headline || "Role", company ? `— ${company}` : ""].filter(Boolean).join(" "),
      "",
      "SKILLS",
      skills.join(", ") || "see People Data Labs / LinkedIn profile",
    ].join("\n"),
    sourceSignals: [
      "People Data Labs Person Search API",
      company ? `Current company: ${company}` : "Profile match",
      skills[0] ? `Skill signal: ${skills[0]}` : "Title match",
      experienceYears != null ? `${experienceYears}+ years` : "Experience on file",
    ],
  };
}

/**
 * People Data Labs Person Search API.
 * Docs: https://docs.peopledatalabs.com/docs/person-search-api
 */
export async function searchPeopleDataLabs(
  query: PeopleSearchQuery,
): Promise<PeopleProviderResult> {
  const started = Date.now();
  const apiKey = peopleDataLabsApiKey();
  if (!apiKey) {
    return {
      provider: "peopledatalabs",
      mode: "skipped",
      candidates: [],
      error: "PEOPLEDATALABS_API_KEY not set",
      latencyMs: Date.now() - started,
    };
  }

  // If Maria/platform filter excludes PDL, skip live call.
  if (
    query.platforms?.length &&
    !query.platforms.includes("peopledatalabs")
  ) {
    return {
      provider: "peopledatalabs",
      mode: "skipped",
      candidates: [],
      error: "peopledatalabs not in platformIds filter",
      latencyMs: Date.now() - started,
    };
  }

  try {
    const body = buildQuery(query);
    const response = await fetch(SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    if (!response.ok) {
      return {
        provider: "peopledatalabs",
        mode: "error",
        candidates: [],
        error: `People Data Labs HTTP ${response.status}: ${text.slice(0, 240)}`,
        latencyMs: Date.now() - started,
      };
    }
    const rows = asPeople(payload).slice(0, body.size);
    return {
      provider: "peopledatalabs",
      mode: "live",
      candidates: rows.map((row, index) =>
        mapCandidate(row, index, query.job.id),
      ),
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    return {
      provider: "peopledatalabs",
      mode: "error",
      candidates: [],
      error:
        error instanceof Error
          ? error.message
          : "People Data Labs search failed",
      latencyMs: Date.now() - started,
    };
  }
}
