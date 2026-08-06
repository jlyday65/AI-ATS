/**
 * Board / Maria import dedupe helpers.
 * Same person when email matches, or phone matches, or full name matches.
 * There should never be duplicate candidate cards on the Board.
 */

function normEmail(person = {}) {
  return String(person.email || "").trim().toLowerCase();
}

function normPhone(person = {}) {
  return String(person.phone || "").replace(/\D/g, "");
}

function normName(person = {}) {
  return String(person.name || person.fullName || "")
    .trim()
    .toLowerCase();
}

function resumeLen(person = {}) {
  return String(
    person.resumeText || person.resume_text || person.summary || "",
  ).length;
}

/** All stable keys for a person (email, phone, name). */
export function personDedupeKeys(person = {}) {
  const keys = [];
  const email = normEmail(person);
  if (email) keys.push(`e:${email}`);
  const phone = normPhone(person);
  if (phone.length >= 7) keys.push(`p:${phone}`);
  const name = normName(person);
  if (name) keys.push(`n:${name}`);
  return keys;
}

/** Primary key for maps (email > phone > name). */
export function personDedupeKey(person = {}) {
  return personDedupeKeys(person)[0] || "";
}

export function samePerson(a = {}, b = {}) {
  const ae = normEmail(a);
  const be = normEmail(b);
  if (ae && be && ae === be) return true;
  const ap = normPhone(a);
  const bp = normPhone(b);
  if (ap.length >= 7 && bp.length >= 7 && ap === bp) return true;
  const an = normName(a);
  const bn = normName(b);
  if (an && bn && an === bn) return true;
  return false;
}

export function mergePersons(prev, next) {
  const keepPrev = resumeLen(prev) >= resumeLen(next);
  const base = keepPrev ? prev : next;
  const other = keepPrev ? next : prev;
  return {
    ...other,
    ...base,
    id: prev.id ?? base.id,
    email: base.email || other.email || "",
    phone: base.phone || other.phone || "",
    resumeText:
      base.resumeText ||
      base.resume_text ||
      other.resumeText ||
      other.resume_text ||
      "",
    summary: base.summary || other.summary || "",
    headline: base.headline || other.headline || "",
    role: base.role || other.role || "",
    jobTitle: base.jobTitle || other.jobTitle || "",
    source: base.source || other.source || "",
  };
}

/**
 * Collapse duplicate people, keeping the richest card (longest resume).
 * @param {Array<object>} list
 * @returns {{ list: Array<object>, removed: number }}
 */
export function dedupeCandidateList(list = []) {
  const out = [];
  let removed = 0;
  for (const c of Array.isArray(list) ? list : []) {
    const idx = out.findIndex((x) => samePerson(x, c));
    if (idx < 0) {
      out.push(c);
      continue;
    }
    out[idx] = mergePersons(out[idx], c);
    removed += 1;
  }
  return { list: out, removed };
}

/**
 * Dedupe a Maria / SignalHire shortlist before push or queue.
 */
export function dedupeIncomingCandidates(candidates = []) {
  return dedupeCandidateList(candidates).list;
}
