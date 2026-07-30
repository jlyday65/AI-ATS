import type { CandidateProfile, JobRequisition } from "@/lib/types";

export type PeopleProviderId = "coresignal" | "brightdata" | "demo";

export interface PeopleSearchQuery {
  job: JobRequisition;
  limit?: number;
  platforms?: string[];
  forceDemo?: boolean;
  providers?: PeopleProviderId[];
}

export interface PeopleProviderResult {
  provider: PeopleProviderId;
  mode: "live" | "demo" | "skipped" | "error";
  candidates: CandidateProfile[];
  error?: string;
  latencyMs: number;
}

export interface PeopleSearchReport {
  providers: PeopleProviderResult[];
  candidates: CandidateProfile[];
  mode: "live" | "demo" | "mixed";
}
