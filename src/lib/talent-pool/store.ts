import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { TalentPoolCandidate } from "@/lib/talent-pool/types";

const DATA_DIR = path.join(process.cwd(), ".data");
const STORE_PATH = path.join(DATA_DIR, "talent-pool.json");

function load(): TalentPoolCandidate[] {
  try {
    if (!existsSync(STORE_PATH)) return [];
    const raw = JSON.parse(readFileSync(STORE_PATH, "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function save(rows: TalentPoolCandidate[]) {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(STORE_PATH, JSON.stringify(rows, null, 2), "utf8");
  } catch {
    // keep memory
  }
}

function personKey(row: { email?: string; fullName: string }): string {
  return (
    row.email?.trim().toLowerCase() ||
    row.fullName.trim().toLowerCase()
  );
}

let memory: TalentPoolCandidate[] = load();

export function listTalentPool(limit = 500): TalentPoolCandidate[] {
  return memory
    .slice()
    .sort((a, b) => String(b.archivedAt).localeCompare(String(a.archivedAt)))
    .slice(0, limit);
}

export function upsertTalentCandidates(
  candidates: TalentPoolCandidate[],
): TalentPoolCandidate[] {
  const byKey = new Map<string, TalentPoolCandidate>();
  for (const row of memory) {
    const key = personKey(row);
    if (key) byKey.set(key, row);
  }

  const saved: TalentPoolCandidate[] = [];
  for (const candidate of candidates) {
    const key = personKey(candidate);
    if (!key) continue;
    const prev = byKey.get(key);
    if (prev) {
      const merged: TalentPoolCandidate = {
        ...prev,
        ...candidate,
        id: prev.id,
        skills: [...new Set([...(prev.skills || []), ...(candidate.skills || [])])],
        resumeText: candidate.resumeText || prev.resumeText,
        tags: [...new Set([...(prev.tags || []), ...(candidate.tags || [])])],
      };
      byKey.set(key, merged);
      saved.push(merged);
    } else {
      const row = {
        ...candidate,
        id: candidate.id || `tp_${randomUUID().slice(0, 10)}`,
      };
      byKey.set(key, row);
      saved.push(row);
    }
  }

  memory = [...byKey.values()]
    .sort((a, b) => String(b.archivedAt).localeCompare(String(a.archivedAt)))
    .slice(0, 2000);
  save(memory);
  return saved;
}

export function clearTalentPool() {
  memory = [];
  save(memory);
}
