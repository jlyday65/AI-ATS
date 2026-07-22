import { randomUUID } from "crypto";
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

const globalStore = globalThis as typeof globalThis & {
  __aiAtsStore?: DatabaseShape;
};

function seed(): DatabaseShape {
  const orgId = "org_demo_acme";
  const now = new Date().toISOString();

  const organization: Organization = {
    id: orgId,
    name: "Acme Talent Group",
    slug: "acme-talent",
    industry: "Staffing & Recruiting",
    plan: "growth",
    seats: 25,
    createdAt: now,
  };

  const members: OrgMember[] = [
    {
      id: "mem_owner",
      orgId,
      email: "owner@acme-talent.example",
      name: "Jordan Lee",
      role: "owner",
    },
    {
      id: "mem_recruiter",
      orgId,
      email: "recruiter@acme-talent.example",
      name: "Sam Rivera",
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
      atsExternalId: "claude_req_1001",
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
      atsExternalId: "claude_req_1002",
      status: "open",
      createdAt: now,
    },
  ];

  const atsConnections: AtsConnection[] = [
    {
      id: "ats_claude_primary",
      orgId,
      provider: "claude_ats",
      displayName: "Claude ATS Production",
      baseUrl: "https://your-claude-ats.example.com/api/v1",
      apiKeyConfigured: true,
      syncDirection: "bidirectional",
      status: "connected",
      lastSyncAt: now,
      config: {
        apiKey: "demo-key",
        demoMode: "true",
        webhookSecret: "whsec_demo",
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
  if (!globalStore.__aiAtsStore) {
    globalStore.__aiAtsStore = seed();
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
  const existing = input.id ? getAtsConnection(input.id) : undefined;
  if (existing) {
    Object.assign(existing, input, {
      status: input.status ?? "connected",
      apiKeyConfigured: Boolean(input.config.apiKey) || existing.apiKeyConfigured,
    });
    return existing;
  }

  const connection: AtsConnection = {
    id: `ats_${randomUUID().slice(0, 8)}`,
    orgId: input.orgId,
    provider: input.provider,
    displayName: input.displayName,
    baseUrl: input.baseUrl,
    apiKeyConfigured: Boolean(input.config.apiKey),
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
