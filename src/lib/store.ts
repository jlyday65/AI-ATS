import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { GINA_DEFAULT_BASE_URL } from "@/lib/ats/gina-client";
import {
  DEFAULT_APP_SETTINGS,
  normalizeAppSettings,
  readAtsModeFromEnv,
} from "@/lib/settings";
import type {
  AppSettings,
  AtsConnection,
  JobRequisition,
  Organization,
  OrgMember,
  ResumeApplication,
  SourcingRun,
  SyncEvent,
} from "@/lib/types";

interface DatabaseShape {
  organizations: Organization[];
  members: OrgMember[];
  jobs: JobRequisition[];
  atsConnections: AtsConnection[];
  sourcingRuns: SourcingRun[];
  syncEvents: SyncEvent[];
  resumeApplications: ResumeApplication[];
  settings: AppSettings;
}

const STORE_VERSION = "gina-v5-ats-mode";
const DATA_DIR = path.join(process.cwd(), ".data");
const STORE_PATH = path.join(DATA_DIR, "ai-ats-store.json");

const globalStore = globalThis as typeof globalThis & {
  __aiAtsStore?: DatabaseShape;
  __aiAtsStoreVersion?: string;
};

function seed(): DatabaseShape {
  const orgId = "org_lyday_talent";
  const now = new Date().toISOString();

  const organization: Organization = {
    id: orgId,
    name: "Lyday Talent Partners",
    slug: "lyday-talent-partners",
    industry: "Executive Search & Workforce Strategy",
    plan: "enterprise",
    seats: 40,
    createdAt: now,
  };

  const members: OrgMember[] = [
    {
      id: "mem_owner",
      orgId,
      email: "james@lydaytalentpartners.com",
      name: "James Lyday",
      role: "owner",
    },
    {
      id: "mem_recruiter",
      orgId,
      email: "recruiting@lydaytalentpartners.com",
      name: "Talent Desk",
      role: "recruiter",
    },
  ];

  const jobs: JobRequisition[] = [
    {
      id: "job_senior_fullstack",
      orgId,
      title: "Senior Full-Stack Engineer",
      department: "Engineering",
      location: "Remote — US",
      employmentType: "full_time",
      description:
        "Build B2B recruiting products with Next.js, TypeScript, and AI-assisted workflows.",
      requiredSkills: ["TypeScript", "React", "Node.js", "PostgreSQL"],
      preferredSkills: ["Next.js", "LLM tooling", "ATS integrations"],
      seniority: "Senior",
      remote: true,
      atsExternalId: "gina_req_1001",
      status: "open",
      createdAt: now,
    },
    {
      id: "job_clinical_ops",
      orgId,
      title: "Clinical Operations Manager",
      department: "Healthcare",
      location: "Chicago, IL",
      employmentType: "full_time",
      description: "Lead clinical ops programs across multi-site provider networks.",
      requiredSkills: ["Clinical operations", "HIPAA", "Stakeholder management"],
      preferredSkills: ["Epic", "Quality improvement"],
      seniority: "Manager",
      remote: false,
      atsExternalId: "gina_req_1002",
      status: "open",
      createdAt: now,
    },
    {
      id: "job_warehouse_manager",
      orgId,
      title: "Warehouse Manager",
      department: "Operations",
      location: "Charlotte, NC",
      employmentType: "full_time",
      description:
        "Lead warehouse and distribution operations in Charlotte, NC — team leadership, inventory control, WMS, and OSHA-aligned safety.",
      requiredSkills: [
        "warehouse",
        "inventory",
        "WMS",
        "OSHA",
        "leadership",
        "logistics",
      ],
      preferredSkills: ["lean", "forklift", "SAP", "supply chain"],
      seniority: "Manager",
      remote: false,
      atsExternalId: "gina_req_1003",
      status: "open",
      createdAt: now,
    },
  ];

  // Optional bootstrap from .env.local — only used when no persisted store exists yet.
  const envRelay = (process.env.RELAY_SECRET || process.env.GINA_RELAY_SECRET || "").trim();
  const atsConnections: AtsConnection[] = [
    {
      id: "ats_gina_production",
      orgId,
      provider: "gina_ats",
      displayName: "Gina ATS Production",
      baseUrl: GINA_DEFAULT_BASE_URL,
      apiKeyConfigured: Boolean(envRelay),
      syncDirection: "bidirectional",
      status: envRelay ? "connected" : "pending",
      lastSyncAt: undefined,
      config: {
        apiKey: "",
        appPassword: "",
        relaySecret: envRelay,
        demoMode: "false",
      },
    },
  ];

  const envMode = readAtsModeFromEnv();
  return {
    organizations: [organization],
    members,
    jobs,
    atsConnections,
    sourcingRuns: [],
    syncEvents: [],
    resumeApplications: [],
    settings: normalizeAppSettings({
      ...DEFAULT_APP_SETTINGS,
      ...(envMode ? { atsMode: envMode } : {}),
    }),
  };
}

function loadPersisted(): DatabaseShape | null {
  try {
    if (!existsSync(STORE_PATH)) return null;
    const raw = readFileSync(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as DatabaseShape & { version?: string };
    if (!parsed?.atsConnections || !parsed?.organizations) return null;
    return {
      ...parsed,
      resumeApplications: parsed.resumeApplications ?? [],
      settings: normalizeAppSettings(parsed.settings ?? DEFAULT_APP_SETTINGS),
    };
  } catch {
    return null;
  }
}

function persist(store: DatabaseShape): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(
      STORE_PATH,
      JSON.stringify({ version: STORE_VERSION, ...store }, null, 2),
      "utf8",
    );
  } catch {
    // Local file write can fail in some sandboxes — in-memory still works for the session.
  }
}

function ensureSeedJobs(store: DatabaseShape): void {
  const seeded = seed().jobs;
  for (const job of seeded) {
    if (!store.jobs.some((item) => item.id === job.id)) {
      store.jobs.push(job);
    }
  }
}

function db(): DatabaseShape {
  if (!globalStore.__aiAtsStore || globalStore.__aiAtsStoreVersion !== STORE_VERSION) {
    globalStore.__aiAtsStore = loadPersisted() ?? seed();
    globalStore.__aiAtsStoreVersion = STORE_VERSION;
    ensureSeedJobs(globalStore.__aiAtsStore);
    if (!globalStore.__aiAtsStore.resumeApplications) {
      globalStore.__aiAtsStore.resumeApplications = [];
    }
    globalStore.__aiAtsStore.settings = normalizeAppSettings(
      globalStore.__aiAtsStore.settings ?? DEFAULT_APP_SETTINGS,
    );
    // Ensure a first-run seed is written so Save is not the only persist path.
    persist(globalStore.__aiAtsStore);
  }
  return globalStore.__aiAtsStore;
}

function touch(): void {
  persist(db());
}

export function getDemoOrg(): Organization {
  return db().organizations[0];
}

export function listMembers(orgId: string): OrgMember[] {
  return db().members.filter((member) => member.orgId === orgId);
}

export function listJobs(orgId: string): JobRequisition[] {
  return db().jobs.filter((job) => job.orgId === orgId);
}

export function getJob(jobId: string): JobRequisition | undefined {
  return db().jobs.find((job) => job.id === jobId);
}

export function createJob(
  input: Omit<JobRequisition, "id" | "createdAt" | "status"> & {
    status?: JobRequisition["status"];
  },
): JobRequisition {
  const job: JobRequisition = {
    ...input,
    id: `job_${randomUUID().slice(0, 8)}`,
    status: input.status ?? "open",
    createdAt: new Date().toISOString(),
  };
  db().jobs.unshift(job);
  touch();
  return job;
}

export function listAtsConnections(orgId: string): AtsConnection[] {
  return db().atsConnections.filter((connection) => connection.orgId === orgId);
}

export function getAtsConnection(id: string): AtsConnection | undefined {
  return db().atsConnections.find((connection) => connection.id === id);
}

export function upsertAtsConnection(
  input: Omit<AtsConnection, "id" | "status"> & {
    id?: string;
    status?: AtsConnection["status"];
  },
): AtsConnection {
  const hasSecret = Boolean(input.config.apiKey || input.config.appPassword || input.config.relaySecret);
  const existing = input.id ? getAtsConnection(input.id) : undefined;
  if (existing) {
    Object.assign(existing, input, {
      status: input.status ?? "connected",
      apiKeyConfigured: hasSecret || existing.apiKeyConfigured,
      config: {
        ...existing.config,
        ...input.config,
      },
    });
    touch();
    return existing;
  }

  const connection: AtsConnection = {
    id: `ats_${randomUUID().slice(0, 8)}`,
    orgId: input.orgId,
    provider: input.provider,
    displayName: input.displayName,
    baseUrl: input.baseUrl,
    apiKeyConfigured: hasSecret,
    syncDirection: input.syncDirection,
    lastSyncAt: input.lastSyncAt,
    status: input.status ?? "connected",
    config: input.config,
  };
  db().atsConnections.unshift(connection);
  touch();
  return connection;
}

export function saveSourcingRun(run: SourcingRun): SourcingRun {
  db().sourcingRuns.unshift(run);
  touch();
  return run;
}

export function listSourcingRuns(orgId: string): SourcingRun[] {
  return db().sourcingRuns.filter((run) => run.orgId === orgId);
}

export function getSourcingRun(id: string): SourcingRun | undefined {
  return db().sourcingRuns.find((run) => run.id === id);
}

export function addSyncEvent(event: Omit<SyncEvent, "id" | "createdAt">): SyncEvent {
  const record: SyncEvent = {
    ...event,
    id: `sync_${randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
  };
  db().syncEvents.unshift(record);
  touch();
  return record;
}

export function listSyncEvents(orgId: string): SyncEvent[] {
  return db().syncEvents.filter((event) => event.orgId === orgId);
}

export function saveResumeApplication(application: ResumeApplication): ResumeApplication {
  db().resumeApplications.unshift(application);
  touch();
  return application;
}

export function listResumeApplications(orgId: string): ResumeApplication[] {
  return db().resumeApplications.filter((item) => item.orgId === orgId);
}

export function getAppSettings(): AppSettings {
  return normalizeAppSettings(db().settings);
}

export function updateAppSettings(
  partial: Partial<AppSettings>,
): AppSettings {
  const next = normalizeAppSettings({
    ...db().settings,
    ...partial,
    updatedAt: new Date().toISOString(),
  });
  db().settings = next;
  touch();
  return next;
}
