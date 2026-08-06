import {
  brightDataApiKey,
  brightDataJobsDatasetId,
} from "@/lib/jobs-market/env";
import type {
  JobPosting,
  JobsMarketProviderResult,
  JobsMarketQuery,
} from "@/lib/jobs-market/types";

const TRIGGER_URL = "https://api.brightdata.com/datasets/v3/trigger";
const SNAPSHOT_URL = "https://api.brightdata.com/datasets/v3/snapshot";

function countryFromLocation(location?: string): string {
  const value = (location || "").toLowerCase();
  if (!value) return "US";
  if (/\b(uk|united kingdom|england|scotland|wales)\b/.test(value)) return "GB";
  if (/\b(canada|toronto|vancouver|montreal)\b/.test(value)) return "CA";
  if (/\b(germany|berlin|munich|hamburg)\b/.test(value)) return "DE";
  if (/\b(france|paris|lyon)\b/.test(value)) return "FR";
  return "US";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asArray(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object",
    );
  }
  return [];
}

function mapPosting(row: Record<string, unknown>, index: number): JobPosting {
  const id = String(
    row.job_posting_id ?? row.jobid ?? row.job_id ?? row.id ?? index,
  );
  return {
    id: `brightdata_${id}`,
    title: String(row.job_title ?? row.title ?? "Untitled role"),
    company: row.company_name
      ? String(row.company_name)
      : row.company
        ? String(row.company)
        : undefined,
    location: row.job_location
      ? String(row.job_location)
      : row.location
        ? String(row.location)
        : undefined,
    url: row.url
      ? String(row.url)
      : row.apply_link
        ? String(row.apply_link)
        : undefined,
    description: row.job_summary
      ? String(row.job_summary).slice(0, 1200)
      : row.description_text
        ? String(row.description_text).slice(0, 1200)
        : undefined,
    employmentType: row.job_employment_type
      ? String(row.job_employment_type)
      : undefined,
    seniority: row.job_seniority_level
      ? String(row.job_seniority_level)
      : undefined,
    salaryText: row.job_base_pay_range
      ? String(row.job_base_pay_range)
      : row.salary_formatted
        ? String(row.salary_formatted)
        : undefined,
    postedAt: row.job_posted_date
      ? String(row.job_posted_date).slice(0, 10)
      : row.date_posted
        ? String(row.date_posted).slice(0, 10)
        : undefined,
    source: "brightdata",
  };
}

async function pollSnapshot(
  apiKey: string,
  snapshotId: string,
  timeoutMs: number,
): Promise<Record<string, unknown>[]> {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    const response = await fetch(
      `${SNAPSHOT_URL}/${encodeURIComponent(snapshotId)}?format=json`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
    );
    const text = await response.text();
    if (response.status === 202) {
      await sleep(Math.min(2000 + attempt * 500, 5000));
      continue;
    }
    if (!response.ok) {
      throw new Error(
        `Bright Data snapshot HTTP ${response.status}: ${text.slice(0, 240)}`,
      );
    }
    let payload: unknown;
    try {
      payload = text ? JSON.parse(text) : [];
    } catch {
      throw new Error(`Bright Data snapshot JSON parse failed: ${text.slice(0, 120)}`);
    }
    if (
      payload &&
      typeof payload === "object" &&
      !Array.isArray(payload) &&
      "status" in (payload as object)
    ) {
      const status = String((payload as { status?: string }).status || "");
      if (status === "running" || status === "building" || status === "collecting") {
        await sleep(Math.min(2000 + attempt * 500, 5000));
        continue;
      }
    }
    return asArray(payload);
  }
  throw new Error(
    `Bright Data snapshot ${snapshotId} timed out after ${timeoutMs}ms`,
  );
}

/**
 * Bright Data LinkedIn Jobs discover-by-keyword (async trigger + poll).
 * Dataset default: gd_lpfll7v5hcqtkxl6l
 */
export async function searchBrightDataJobs(
  query: JobsMarketQuery,
): Promise<JobsMarketProviderResult> {
  const started = Date.now();
  const apiKey = brightDataApiKey();
  if (!apiKey) {
    return {
      provider: "brightdata",
      mode: "skipped",
      postings: [],
      error: "BRIGHTDATA_API_KEY not set",
      latencyMs: Date.now() - started,
    };
  }

  const limit = Math.min(query.limit ?? 12, 25);
  const datasetId = brightDataJobsDatasetId();
  const timeoutMs = Number(process.env.BRIGHTDATA_JOBS_TIMEOUT_MS || 45000);

  try {
    const params = new URLSearchParams({
      dataset_id: datasetId,
      include_errors: "true",
      type: "discover_new",
      discover_by: "keyword",
      limit_per_input: String(limit),
      format: "json",
    });
    const body = [
      {
        keyword: query.roleTitle,
        location: (query.location || "").trim(),
        country: countryFromLocation(query.location),
        time_range: "Past month",
        job_type: "",
        experience_level: "",
        remote: /\bremote\b/i.test(query.location || "") ? "Remote" : "",
        company: "",
        location_radius: "",
      },
    ];

    const trigger = await fetch(`${TRIGGER_URL}?${params.toString()}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const triggerText = await trigger.text();
    let triggerJson: Record<string, unknown> = {};
    try {
      triggerJson = triggerText ? JSON.parse(triggerText) : {};
    } catch {
      triggerJson = {};
    }
    if (!trigger.ok) {
      return {
        provider: "brightdata",
        mode: "error",
        postings: [],
        error: `Bright Data trigger HTTP ${trigger.status}: ${triggerText.slice(0, 240)}`,
        latencyMs: Date.now() - started,
      };
    }

    const snapshotId = String(
      triggerJson.snapshot_id || triggerJson.snapshotId || "",
    );
    if (!snapshotId) {
      // Some accounts may return sync arrays for small jobs.
      const syncRows = asArray(triggerJson).length
        ? asArray(triggerJson)
        : asArray(JSON.parse(triggerText || "[]"));
      if (syncRows.length) {
        return {
          provider: "brightdata",
          mode: "live",
          postings: syncRows.slice(0, limit).map(mapPosting),
          latencyMs: Date.now() - started,
        };
      }
      return {
        provider: "brightdata",
        mode: "error",
        postings: [],
        error: "Bright Data trigger returned no snapshot_id",
        latencyMs: Date.now() - started,
      };
    }

    const rows = await pollSnapshot(apiKey, snapshotId, timeoutMs);
    return {
      provider: "brightdata",
      mode: "live",
      postings: rows.slice(0, limit).map(mapPosting),
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    return {
      provider: "brightdata",
      mode: "error",
      postings: [],
      error: error instanceof Error ? error.message : "Bright Data Jobs failed",
      latencyMs: Date.now() - started,
    };
  }
}
