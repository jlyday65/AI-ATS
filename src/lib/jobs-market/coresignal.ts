import { coresignalApiKey } from "@/lib/jobs-market/env";
import type {
  JobPosting,
  JobsMarketProviderResult,
  JobsMarketQuery,
} from "@/lib/jobs-market/types";

const PREVIEW_URL =
  "https://api.coresignal.com/cdapi/v2/job_multi_source/search/es_dsl/preview";

function buildEsQuery(query: JobsMarketQuery) {
  const must: Array<Record<string, unknown>> = [
    {
      match: {
        title: query.roleTitle,
      },
    },
  ];
  if (query.location?.trim()) {
    must.push({
      match: {
        location: query.location.trim(),
      },
    });
  }
  for (const keyword of query.keywords || []) {
    const value = keyword.trim();
    if (!value) continue;
    must.push({
      multi_match: {
        query: value,
        fields: ["title", "description", "company_name"],
      },
    });
  }
  return {
    query: {
      bool: { must },
    },
  };
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
    for (const key of ["results", "data", "hits", "jobs"]) {
      if (Array.isArray(obj[key])) {
        return asArray(obj[key]);
      }
    }
    if (obj.hits && typeof obj.hits === "object") {
      const hits = obj.hits as Record<string, unknown>;
      if (Array.isArray(hits.hits)) {
        return hits.hits
          .map((hit) => {
            if (!hit || typeof hit !== "object") return null;
            const h = hit as Record<string, unknown>;
            const source = h._source;
            if (source && typeof source === "object") {
              return source as Record<string, unknown>;
            }
            return h;
          })
          .filter((item): item is Record<string, unknown> => Boolean(item));
      }
    }
  }
  return [];
}

function mapPosting(row: Record<string, unknown>, index: number): JobPosting {
  const id = String(row.id ?? row.job_id ?? `coresignal_${index}`);
  return {
    id: `coresignal_${id}`,
    title: String(row.title ?? row.job_title ?? "Untitled role"),
    company: row.company_name
      ? String(row.company_name)
      : row.company
        ? String(row.company)
        : undefined,
    location: row.location
      ? String(row.location)
      : row.job_location
        ? String(row.job_location)
        : undefined,
    url: row.url ? String(row.url) : row.job_url ? String(row.job_url) : undefined,
    description: row.description
      ? String(row.description).slice(0, 1200)
      : undefined,
    employmentType: row.employment_type
      ? String(row.employment_type)
      : undefined,
    seniority: row.seniority ? String(row.seniority) : undefined,
    salaryText: row.salary ? String(row.salary) : undefined,
    postedAt: row.created_at
      ? String(row.created_at).slice(0, 10)
      : row.posted_at
        ? String(row.posted_at).slice(0, 10)
        : undefined,
    source: "coresignal",
    rawScore:
      typeof row._score === "number"
        ? row._score
        : typeof row.score === "number"
          ? row.score
          : undefined,
  };
}

/**
 * Coresignal Multi-source Jobs API (search preview).
 * Docs: https://docs.coresignal.com/jobs-api/multi-source-jobs-api
 */
export async function searchCoresignalJobs(
  query: JobsMarketQuery,
): Promise<JobsMarketProviderResult> {
  const started = Date.now();
  const apiKey = coresignalApiKey();
  if (!apiKey) {
    return {
      provider: "coresignal",
      mode: "skipped",
      postings: [],
      error: "CORESIGNAL_API_KEY not set",
      latencyMs: Date.now() - started,
    };
  }

  try {
    const limit = Math.min(query.limit ?? 12, 25);
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
      payload = { raw: text };
    }
    if (!response.ok) {
      return {
        provider: "coresignal",
        mode: "error",
        postings: [],
        error: `Coresignal Jobs HTTP ${response.status}: ${text.slice(0, 240)}`,
        latencyMs: Date.now() - started,
      };
    }
    const rows = asArray(payload).slice(0, limit);
    return {
      provider: "coresignal",
      mode: "live",
      postings: rows.map(mapPosting),
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    return {
      provider: "coresignal",
      mode: "error",
      postings: [],
      error: error instanceof Error ? error.message : "Coresignal Jobs failed",
      latencyMs: Date.now() - started,
    };
  }
}
