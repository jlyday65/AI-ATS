import { createHash, timingSafeEqual } from "crypto";
import { getDemoOrg, listAtsConnections } from "@/lib/store";

/**
 * Maria (Gina) authenticates to SignalHire with the same RELAY_SECRET
 * used for Gina ATS imports.
 */
export function resolveSignalHireRelaySecret(): string {
  const org = getDemoOrg();
  const connection = listAtsConnections(org.id).find((item) =>
    Boolean(item.config.relaySecret?.trim()),
  );
  return (
    connection?.config.relaySecret?.trim() ||
    process.env.RELAY_SECRET?.trim() ||
    process.env.GINA_RELAY_SECRET?.trim() ||
    ""
  );
}

export function readRelaySecretFromRequest(request: Request): string {
  const header =
    request.headers.get("x-relay-secret") ||
    request.headers.get("X-Relay-Secret") ||
    "";
  if (header.trim()) return header.trim();

  const auth = request.headers.get("authorization") || "";
  return auth.replace(/^Bearer\s+/i, "").trim();
}

export function hasValidMariaRelay(request: Request): boolean {
  const expected = resolveSignalHireRelaySecret();
  const provided = readRelaySecretFromRequest(request);
  if (!expected || !provided || expected.length !== provided.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

export function fingerprintSecret(secret: string): string {
  const value = secret.trim();
  if (!value) return "empty";
  return `len=${value.length},sha256_8=${createHash("sha256").update(value).digest("hex").slice(0, 8)}`;
}
