export type PlatformCategory =
  | "professional"
  | "developer"
  | "design"
  | "academic"
  | "healthcare"
  | "job_board"
  | "social"
  | "community"
  | "identity";

export type PlatformStatus = "live" | "beta" | "planned";

export interface CandidatePlatform {
  id: string;
  name: string;
  category: PlatformCategory;
  status: PlatformStatus;
  description: string;
  homepage: string;
  supportsSearch: boolean;
  supportsEnrichment: boolean;
}

export interface CandidateProfile {
  id: string;
  fullName: string;
  headline?: string;
  location?: string;
  email?: string;
  phone?: string;
  skills: string[];
  experienceYears?: number;
  platforms: Array<{
    platformId: string;
    profileUrl: string;
    handle?: string;
  }>;
  summary?: string;
  /** Full extracted resume text for Gina / Maria evaluation */
  resumeText?: string;
  /** Formatted education lines for ATS profile (also embedded in resumeText) */
  education?: string;
  sourceSignals: string[];
}

export interface ResumeApplication {
  id: string;
  orgId: string;
  jobId: string;
  fileName: string;
  candidateName: string;
  candidateEmail?: string;
  candidatePhone?: string;
  resumeText: string;
  extractedSkills: string[];
  matchScore: number;
  matchReasons: string[];
  pushToGina: boolean;
  atsSync?: { ok: boolean; message: string };
  createdAt: string;
}

export interface JobRequisition {
  id: string;
  orgId: string;
  title: string;
  department?: string;
  location?: string;
  employmentType: "full_time" | "contract" | "part_time" | "internship";
  description: string;
  requiredSkills: string[];
  preferredSkills: string[];
  seniority?: string;
  remote?: boolean;
  atsExternalId?: string;
  status: "open" | "paused" | "closed";
  createdAt: string;
}

export interface MatchResult {
  candidate: CandidateProfile;
  score: number;
  reasons: string[];
  platformHits: string[];
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  industry?: string;
  plan: "starter" | "growth" | "enterprise";
  seats: number;
  createdAt: string;
}

export interface OrgMember {
  id: string;
  orgId: string;
  email: string;
  name: string;
  role: "owner" | "admin" | "recruiter" | "hiring_manager";
}

export type AtsProvider =
  | "gina_ats"
  | "claude_ats"
  | "greenhouse"
  | "lever"
  | "workday"
  | "icims"
  | "bullhorn"
  | "custom_webhook";

export interface AtsConnection {
  id: string;
  orgId: string;
  provider: AtsProvider;
  displayName: string;
  baseUrl: string;
  apiKeyConfigured: boolean;
  syncDirection: "push" | "pull" | "bidirectional";
  lastSyncAt?: string;
  status: "connected" | "error" | "pending";
  config: Record<string, string>;
}

export interface SourcingRun {
  id: string;
  orgId: string;
  jobId: string;
  status: "queued" | "running" | "completed" | "failed";
  platformsQueried: string[];
  candidateCount: number;
  startedAt: string;
  completedAt?: string;
  matches: MatchResult[];
}

export interface SyncEvent {
  id: string;
  orgId: string;
  atsConnectionId: string;
  direction: "push" | "pull";
  entityType: "candidate" | "job" | "application";
  payloadSummary: string;
  status: "success" | "failed";
  createdAt: string;
}

/** SignalHire workspace operating mode. */
export type AtsMode = "test" | "live";

/** Idle minutes before live-mode password re-entry. */
export type SessionTimeoutMinutes = 5 | 10 | 15;

export interface AppSettings {
  /** test = demo sourcing + ats-test tags; live = production labels + password gate */
  atsMode: AtsMode;
  /** Client-configurable session lockout in live mode */
  sessionTimeoutMinutes: SessionTimeoutMinutes;
  updatedAt?: string;
}
