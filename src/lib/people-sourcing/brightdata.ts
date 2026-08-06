import {
  brightDataApiKey,
  brightDataPeopleDatasetId,
} from "@/lib/people-sourcing/env";
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
  hasUsableResumeWithWorkHistory,
} from "@/lib/resumes/experience";
import type { CandidateProfile } from "@/lib/types";

const SCRAPE_URL = "https://api.brightdata.com/datasets/v3/scrape";

/**
 * Bright Data LinkedIn people scrape is URL-based.
 * When seed LinkedIn URLs are provided via env BRIGHTDATA_PEOPLE_SEED_URLS
 * (comma-separated), enrich those profiles for the open role.
 *
 * Keyword people discovery is not enabled by default — Jobs discover uses a
 * different dataset. Without seed URLs this provider is skipped.
 */
export async function searchBrightDataPeople(
  query: PeopleSearchQuery,
): Promise<PeopleProviderResult> {
  const started = Date.now();
  const apiKey = brightDataApiKey();
  if (!apiKey) {
    return {
      provider: "brightdata",
      mode: "skipped",
      candidates: [],
      error: "BRIGHTDATA_API_KEY not set",
      latencyMs: Date.now() - started,
    };
  }

  const seeds = (process.env.BRIGHTDATA_PEOPLE_SEED_URLS || "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => /linkedin\.com\/in\//i.test(s))
    .slice(0, Math.min(query.limit ?? 10, 15));

  if (!seeds.length) {
    return {
      provider: "brightdata",
      mode: "skipped",
      candidates: [],
      error:
        "BRIGHTDATA_PEOPLE_SEED_URLS empty — set LinkedIn /in/ URLs to enrich, or rely on Coresignal/demo for search",
      latencyMs: Date.now() - started,
    };
  }

  try {
    const datasetId = brightDataPeopleDatasetId();
    const response = await fetch(
      `${SCRAPE_URL}?dataset_id=${encodeURIComponent(datasetId)}&format=json`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(seeds.map((url) => ({ url }))),
      },
    );
    const text = await response.text();
    if (!response.ok) {
      return {
        provider: "brightdata",
        mode: "error",
        candidates: [],
        error: `Bright Data people HTTP ${response.status}: ${text.slice(0, 240)}`,
        latencyMs: Date.now() - started,
      };
    }

    let rows: Record<string, unknown>[] = [];
    try {
      const payload = text ? JSON.parse(text) : [];
      rows = Array.isArray(payload)
        ? payload.filter(
            (item): item is Record<string, unknown> =>
              Boolean(item) && typeof item === "object",
          )
        : [];
    } catch {
      return {
        provider: "brightdata",
        mode: "error",
        candidates: [],
        error: "Bright Data people response was not JSON",
        latencyMs: Date.now() - started,
      };
    }

    const candidates: CandidateProfile[] = rows.map((row, index) => {
      const fullName = String(row.name || row.full_name || `LinkedIn ${index + 1}`);
      const headline = row.position
        ? String(row.position)
        : row.headline
          ? String(row.headline)
          : undefined;
      const location = row.city
        ? String(row.city)
        : row.location
          ? String(row.location)
          : undefined;
      const url = row.url
        ? String(row.url)
        : seeds[index] || `https://www.linkedin.com/in/unknown-${index}`;
      const about = row.about ? String(row.about).slice(0, 1000) : undefined;
      const skills: string[] = Array.isArray(row.skills)
        ? row.skills.map(String).slice(0, 12)
        : [];
      const rowRecord = row as Record<string, unknown>;
      const educationLines = educationFromProviderRow(rowRecord);
      const experienceBody =
        experienceTextFromLines(experienceFromProviderRow(rowRecord)) ||
        (headline ? String(headline) : "");
      if (!experienceBody.trim()) return null;

      const baseResume = [
        fullName,
        headline || "",
        location || "",
        url,
        "",
        "SUMMARY",
        about || `LinkedIn profile enriched for ${query.job.title}.`,
        "",
        "EXPERIENCE",
        experienceBody,
        "",
        "SKILLS",
        skills.join(", ") || "see LinkedIn profile",
      ].join("\n");
      const { resumeText, educationText } = ensureEducationInResumeText({
        resumeText: baseResume,
        educationLines,
        fullName,
        seed: index * 17 + fullName.length,
      });
      if (!hasUsableResumeWithWorkHistory(resumeText)) return null;

      return {
        id: `cand_brightdata_${query.job.id}_${index}`,
        fullName,
        headline,
        location,
        skills,
        education: educationText,
        platforms: [
          {
            platformId: "linkedin",
            profileUrl: url,
            handle: fullName.toLowerCase().replace(/\s+/g, "."),
          },
        ],
        summary:
          about ||
          `Bright Data LinkedIn enrichment for ${query.job.title}.`,
        resumeText,
        sourceSignals: [
          "Bright Data LinkedIn People dataset",
          headline ? `Headline: ${headline}` : "Profile enriched",
        ],
      };
    }).filter((c): c is CandidateProfile => Boolean(c));

    return {
      provider: "brightdata",
      mode: "live",
      candidates,
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    return {
      provider: "brightdata",
      mode: "error",
      candidates: [],
      error:
        error instanceof Error ? error.message : "Bright Data people failed",
      latencyMs: Date.now() - started,
    };
  }
}
