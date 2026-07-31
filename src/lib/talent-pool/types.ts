export interface TalentPoolCandidate {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  headline?: string;
  location?: string;
  skills: string[];
  resumeText?: string;
  summary?: string;
  source?: string;
  stage?: string;
  /** Job title this person was archived from */
  archivedFromJobTitle?: string;
  archivedFromJobDescription?: string;
  archivedAt: string;
  tags?: string[];
}

export interface TalentPoolArchiveInput {
  jobTitle: string;
  jobDescription?: string;
  location?: string;
  clientName?: string;
  candidates: Array<{
    fullName?: string;
    name?: string;
    email?: string;
    phone?: string;
    headline?: string;
    role?: string;
    location?: string;
    skills?: string[];
    resumeText?: string;
    resume?: string;
    summary?: string;
    source?: string;
    stage?: string;
  }>;
  label?: string;
}

export interface TalentPoolMatch {
  candidate: TalentPoolCandidate;
  score: number;
  reasons: string[];
}
