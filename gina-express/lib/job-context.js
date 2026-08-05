/**
 * Shared job / JD context for Maria sourcing + Michelle screening.
 * Prefer the active Jobs-tab description over pasting it into chat each step.
 */

export function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value) && value.length) return value;
  }
  return undefined;
}

/** Pull a structured job context from a flat payload / nested job / context. */
export function extractJobContext(input = {}) {
  const flat = input && typeof input === "object" ? input : {};
  const nested =
    (flat.job && typeof flat.job === "object" && flat.job) ||
    (flat.context && typeof flat.context === "object" && flat.context) ||
    {};
  const selected =
    (flat.selectedJob && typeof flat.selectedJob === "object" && flat.selectedJob) ||
    (flat.activeJob && typeof flat.activeJob === "object" && flat.activeJob) ||
    (flat.currentJob && typeof flat.currentJob === "object" && flat.currentJob) ||
    {};

  const roleTitle = firstNonEmpty(
    flat.roleTitle,
    flat.role_title,
    nested.roleTitle,
    flat.jobTitle,
    flat.job_title,
    selected.title,
    nested.title,
    flat.job?.title,
    typeof flat.role === "string" &&
      !/^(maria|michelle|kelley|kelly|ashton|gina)$/i.test(flat.role)
      ? flat.role
      : "",
  );

  const location = firstNonEmpty(
    flat.location,
    nested.location,
    selected.location,
    flat.job?.location,
  );

  const roleDescription = firstNonEmpty(
    flat.roleDescription,
    flat.jobDescription,
    flat.job_description,
    nested.roleDescription,
    nested.jobDescription,
    nested.description,
    selected.description,
    flat.job?.description,
    typeof flat.requirements === "string" ? flat.requirements : "",
  );

  const requiredSkills = Array.isArray(flat.requiredSkills)
    ? flat.requiredSkills
    : Array.isArray(nested.requiredSkills)
      ? nested.requiredSkills
      : Array.isArray(selected.requiredSkills)
        ? selected.requiredSkills
        : Array.isArray(flat.requirements)
          ? flat.requirements.map(String)
          : undefined;

  const preferredSkills = Array.isArray(flat.preferredSkills)
    ? flat.preferredSkills
    : Array.isArray(nested.preferredSkills)
      ? nested.preferredSkills
      : Array.isArray(selected.preferredSkills)
        ? selected.preferredSkills
        : undefined;

  const jobId = firstNonEmpty(
    flat.jobId,
    nested.jobId,
    selected.id,
    flat.job?.id,
  );

  const candidateFileId = firstNonEmpty(
    flat.candidateFileId,
    nested.candidateFileId,
  );

  return {
    jobId: jobId || undefined,
    candidateFileId: candidateFileId || undefined,
    roleTitle: roleTitle || undefined,
    location: location || undefined,
    roleDescription: roleDescription || undefined,
    jobDescription: roleDescription || undefined,
    requiredSkills,
    preferredSkills,
    seniority: firstNonEmpty(flat.seniority, nested.seniority, selected.seniority),
  };
}

/** Pull skill-like tokens from a job description for Maria search. */
export function skillsFromJobDescription(description = "", limit = 8) {
  const text = String(description || "");
  if (!text.trim()) return [];
  const lexicon = [
    "warehouse",
    "wms",
    "inventory",
    "osha",
    "forklift",
    "logistics",
    "supply chain",
    "lean",
    "six sigma",
    "sap",
    "oracle",
    "leadership",
    "management",
    "operations",
    "distribution",
    "shipping",
    "receiving",
    "kpi",
    "erp",
    "excel",
    "assembly",
    "manufacturing",
    "quality",
    "safety",
  ];
  const lower = text.toLowerCase();
  const hits = lexicon.filter((skill) => lower.includes(skill));
  // Also pull capitalized multi-word requirement-ish phrases from bullets
  const bulletSkills = [
    ...text.matchAll(/(?:^|\n)\s*[-•*]\s*([A-Za-z][A-Za-z0-9 /+&-]{2,40})/g),
  ]
    .map((m) => m[1].trim())
    .filter((s) => s.length >= 3 && s.length <= 40)
    .slice(0, 6);
  return [...new Set([...hits, ...bulletSkills.map((s) => s.toLowerCase())])].slice(
    0,
    limit,
  );
}

/**
 * Build screening questions from the job title + description so Michelle
 * does not need a pasted JD each time.
 */
export function screeningQuestionsFromJob({
  roleTitle = "",
  roleDescription = "",
  location = "",
} = {}) {
  const title = String(roleTitle || "this role").trim();
  const jd = String(roleDescription || "").trim();
  const loc = String(location || "").trim();
  const skills = skillsFromJobDescription(jd, 5);
  const skillHint = skills.length ? skills.slice(0, 3).join(", ") : "the core requirements";

  const questions = [
    `Walk me through your most recent experience that matches ${title}${loc ? ` in/around ${loc}` : ""}.`,
    `Which of these requirements have you owned hands-on: ${skillHint}? Give a concrete example.`,
    "What tools, systems, or processes did you use daily in that role?",
    "Describe a quality, safety, or schedule miss you caught — and how you fixed it.",
    `Why are you a fit for ${title} based on this job description, and what would you need in the first 90 days?`,
  ];

  // Pull up to 2 explicit "must have" style lines from the JD
  const musts = [
    ...jd.matchAll(
      /(?:must have|required|minimum|qualification[s]?)\s*[:\-–]\s*([^\n.]{12,120})/gi,
    ),
  ]
    .map((m) => m[1].trim())
    .slice(0, 2);
  for (const must of musts) {
    questions.push(`This requisition requires: "${must}". Do you meet that, and how?`);
  }

  return questions.slice(0, 7).map((question, i) => ({
    id: `sq_${i + 1}`,
    question,
    askedBy: "Michelle",
  }));
}

/** Merge job context into a command payload.context without wiping existing keys. */
export function mergeJobContext(base = {}, jobCtx = {}) {
  return {
    ...base,
    ...Object.fromEntries(
      Object.entries(jobCtx).filter(([, v]) => v != null && v !== ""),
    ),
  };
}

/**
 * Build a Jobs-tab row from a Maria / Candidate File / chat payload.
 * Used so Gina can populate Jobs when Kimberley sends a new role + JD.
 */
export function jobRecordFromContext(input = {}, { idPrefix = "job" } = {}) {
  const ctx = extractJobContext(input);
  const title = ctx.roleTitle;
  if (!title) return null;
  const description = ctx.roleDescription || ctx.jobDescription || "";
  const now = new Date().toISOString();
  return {
    id: ctx.jobId || `${idPrefix}_${Date.now().toString(36)}`,
    title,
    name: title,
    location: ctx.location || "",
    description,
    jobDescription: description,
    requiredSkills: ctx.requiredSkills || [],
    preferredSkills: ctx.preferredSkills || [],
    seniority: ctx.seniority || "",
    status: "open",
    source: "gina_chat",
    createdAt: now,
    updatedAt: now,
  };
}
