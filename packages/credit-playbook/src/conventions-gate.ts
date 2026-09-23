import {z} from "zod";
import {referenceDataEntrySchema, referenceDataRegistry, referenceDataStatusSchema, type ReferenceDataStatus} from "./reference-data";

/**
 * Date-aware reading of the versioned reference data behind a calculation (IOF, ANBIMA/B3
 * conventions, tax regime). A key is effective only when its entry is approved and the reference
 * date falls inside the closed window [asOf, validUntil]. Every other case is a gap with a reason:
 * unknown key, malformed entry, invalid reference date, a status other than approved, a window
 * that has not opened yet or one that has closed. The gate reads what the registry holds; it never
 * supplies a value, a default or an estimate in place of a missing one.
 */
export const conventionsGateVersion = "2026.09.24-v1";

export const conventionsGapReasonSchema = z.enum([
  "unknown_key",
  "malformed_entry",
  "invalid_reference_date",
  "status_required_missing",
  "status_draft",
  "status_expired",
  "not_yet_effective",
  "expired",
]);
export type ConventionsGapReason = z.infer<typeof conventionsGapReasonSchema>;

export type ConventionsGateEntry = {
  key: string;
  /** Registry metadata as found; null when the key is unknown or the field is unreadable. */
  version: string | null;
  status: ReferenceDataStatus | null;
  owner: string | null;
  effective: "approved" | "gap";
  /** Present exactly when `effective` is `gap`. */
  reason?: ConventionsGapReason;
};

export type ConventionsGateResult = {
  version: typeof conventionsGateVersion;
  referenceDate: string;
  /** One entry per distinct key, in first-seen order. */
  entries: ConventionsGateEntry[];
  /** Keys whose entry is a gap, in the same order. */
  gaps: string[];
};

export type ConventionsGateOptions = {
  /** The registry to read. Defaults to the house registry; tests inject synthetic entries here. */
  registry?: readonly unknown[];
};

type EntryMetadata = Pick<ConventionsGateEntry, "version" | "status" | "owner">;

const isoDateSchema = z.iso.date();
const unknownMetadata: EntryMetadata = {version: null, status: null, owner: null};

export function evaluateConventionsGate(
  keys: readonly string[],
  referenceDate: string,
  options: ConventionsGateOptions = {},
): ConventionsGateResult {
  const registry = options.registry ?? referenceDataRegistry;
  const referenceDateIsValid = isoDateSchema.safeParse(referenceDate).success;
  const entries: ConventionsGateEntry[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(evaluateKey(key, referenceDate, referenceDateIsValid, registry));
  }
  return {
    version: conventionsGateVersion,
    referenceDate,
    entries,
    gaps: entries.filter((entry) => entry.effective === "gap").map((entry) => entry.key),
  };
}

function evaluateKey(key: string, referenceDate: string, referenceDateIsValid: boolean, registry: readonly unknown[]): ConventionsGateEntry {
  const raw = registry.find((candidate) => isRecord(candidate) && candidate.key === key);
  if (raw === undefined) return gap(key, unknownMetadata, "unknown_key");
  const parsed = referenceDataEntrySchema.safeParse(raw);
  if (!parsed.success) return gap(key, metadataOf(raw), "malformed_entry");
  const entry = parsed.data;
  const metadata: EntryMetadata = {version: entry.version, status: entry.status, owner: entry.owner};
  if (!referenceDateIsValid) return gap(key, metadata, "invalid_reference_date");
  if (entry.status !== "approved") return gap(key, metadata, `status_${entry.status}`);
  // The schema already refuses an approved entry without both dates; this keeps the narrowing honest.
  if (entry.asOf === null || entry.validUntil === null) return gap(key, metadata, "malformed_entry");
  // ISO calendar dates compare correctly as strings.
  if (referenceDate < entry.asOf) return gap(key, metadata, "not_yet_effective");
  if (referenceDate > entry.validUntil) return gap(key, metadata, "expired");
  return {key, ...metadata, effective: "approved"};
}

function gap(key: string, metadata: EntryMetadata, reason: ConventionsGapReason): ConventionsGateEntry {
  return {key, ...metadata, effective: "gap", reason};
}

function metadataOf(raw: unknown): EntryMetadata {
  if (!isRecord(raw)) return unknownMetadata;
  const status = referenceDataStatusSchema.safeParse(raw.status);
  return {
    version: typeof raw.version === "string" ? raw.version : null,
    status: status.success ? status.data : null,
    owner: typeof raw.owner === "string" ? raw.owner : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
