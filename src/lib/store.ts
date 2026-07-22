import { randomUUID } from "crypto";
import { GINA_DEFAULT_BASE_URL } from "@/lib/ats/gina-client";
import type {
  AtsConnection,
  JobRequisition,
  Organization,
  OrgMember,
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
}

const STORE_VERSION = "gina-v1";

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
  ];

  const hasSecret = Boolean(
    process.env.RELAY_SECRET ||
      process.env.GINA_RELAY_SECRET ||
      process.env.GINA_ATS_APP_PASSWORD ||
      process.env.GINA_ATS_API_KEY,
  );

  const atsConnections: AtsConnection[] = [
    {
      id: "ats_gina_production",
      orgId,
      provider: "gina_ats",
      displayName: "Gina ATS Production",
      baseUrl: GINA_DEFAULT_BASE_URL,
      apiKeyConfigured: hasSecret,
      syncDirection: "bidirectional",
      status: hasSecret ? "connected" : "pending",
      lastSyncAt: hasSecret ? now : undefined,
      config: {
        apiKey: process.env.GINA_ATS_API_KEY ?? "",
        appPassword: process.env.GINA_ATS_APP_PASSWORD ?? "",
        relaySecret: process.env.RELAY_SECRET || process.env.GINA_RELAY_SECRET || "",
        demoMode: "false",
      },
    },
  ];

  return {
    organizations: [organization],
    members,
    jobs,
    atsConnections,
    sourcingRuns: [],
    syncEvents: [],
  };
}

function db(): DatabaseShape {
  if (!globalStore.__aiAtsStore || globalStore.__aiAtsStoreVersion !== STORE_VERSION) {
    globalStore.__aiAtsStore = seed();
    globalStore.__aiAtsStoreVersion = STORE_VERSION;
  }
  return globalStore.__aiAtsStore;
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
  return connection;
}

export function saveSourcingRun(run: SourcingRun): SourcingRun {
  db().sourcingRuns.unshift(run);
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
  return record;
}

export function listSyncEvents(orgId: string): SyncEvent[] {
  return db().syncEvents.filter((event) => event.orgId === orgId);
}
