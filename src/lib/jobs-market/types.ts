export type JobsMarketProviderId = "coresignal" | "brightdata" | "demo";

export interface JobsMarketQuery {
  roleTitle: string;
  location?: string;
  keywords?: string[];
  limit?: number;
  /** Prefer live APIs when keys exist; demo when unset or all live calls fail */
  providers?: JobsMarketProviderId[];
  /** Force demo postings (tests / offline) */
  forceDemo?: boolean;
}

export interface JobPosting {
  id: string;
  title: string;
  company?: string;
  location?: string;
  url?: string;
  description?: string;
  employmentType?: string;
  seniority?: string;
  salaryText?: string;
  postedAt?: string;
  source: JobsMarketProviderId;
  rawScore?: number;
}

export interface JobsMarketProviderResult {
  provider: JobsMarketProviderId;
  mode: "live" | "demo" | "skipped" | "error";
  postings: JobPosting[];
  error?: string;
  latencyMs: number;
}

export interface JobsMarketInsights {
  competingEmployers: Array<{ company: string; count: number }>;
  commonLocations: Array<{ location: string; count: number }>;
  titleVariants: string[];
  salaryHints: string[];
  summary: string;
}

export interface JobsMarketReport {
  query: {
    roleTitle: string;
    location?: string;
    keywords: string[];
  };
  providers: JobsMarketProviderResult[];
  postings: JobPosting[];
  insights: JobsMarketInsights;
  mode: "live" | "demo" | "mixed";
}
