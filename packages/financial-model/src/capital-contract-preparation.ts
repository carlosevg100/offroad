import {createHash} from "node:crypto";
import {z} from "zod";
import {executors} from "@offroad/credit-playbook";
import {financialCoreVersion} from "@offroad/financial-core";

const text = z.string().trim().min(1).max(2000);
const source = z.strictObject({document: text, sourceVersionId: z.uuid(), observationIds: z.array(z.uuid()).min(1).max(256)});
export const capitalContractPreparationInputSchema = z.strictObject({
  schemaVersion: z.literal("capital-contract-preparation-input.v1"),
  workId: z.uuid(), purpose: text, entityId: z.uuid(), perimeter: z.enum(["consolidated", "parent"]),
  scenario: text, currency: z.enum(["BRL", "USD"]), asOf: z.iso.date(),
  sources: z.array(source).min(1).max(64),
  interest: executors.interestScheduleInputSchema.nullable(),
  covenants: executors.covenantReconciliationInputSchema.nullable(),
  interestConventions: executors.interestEventConventionsSchema.nullable(),
}).superRefine((input, context) => {
  if (Boolean(input.interest) !== Boolean(input.interestConventions)) context.addIssue({code: "custom", message: "Interest requires its explicit conventions"});
  if (!input.interest && !input.covenants) context.addIssue({code: "custom", message: "Contract preparation needs a calculation"});
  for (const property of ["document", "sourceVersionId"] as const) if (new Set(input.sources.map(s => s[property])).size !== input.sources.length) context.addIssue({code: "custom", message: "Ambiguous source identity"});
  const observations = input.sources.flatMap(s => s.observationIds);
  if (new Set(observations).size !== observations.length) context.addIssue({code: "custom", message: "Duplicate observation identity"});
});
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b, "en"))) : v);
}
const fingerprint = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");

/** Source-bound calculation proposals, never contextual adoptions. Inputs are supplied by an
 * authorized reader. Source/version references describe provenance; they grant no access.
 * Every legacy default must be explicitly supplied so it cannot invent a contract term. */
export function prepareCapitalContractEvidence(raw: unknown) {
  const serialized = canonical(raw);
  if (Buffer.byteLength(serialized, "utf8") > 1048576) throw new Error("capital_contract_input_too_large");
  const input = capitalContractPreparationInputSchema.parse(raw);
  if (serialized !== canonical(input)) throw new Error("capital_contract_explicit_terms_required");
  const sourceByDocument = new Map(input.sources.map(s => [s.document, s]));
  const used = new Set<string>();
  const anchors: {path: string; document: string; sourceVersionId: string; observationIds: string[]}[] = [];
  function visit(value: unknown, path: string, depth: number) {
    if (depth > 64) throw new Error("capital_contract_input_too_deep");
    if (Array.isArray(value)) {value.forEach((v, i) => visit(v, `${path}.${i}`, depth + 1)); return;}
    if (!value || typeof value !== "object") {
      if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) z.iso.date().parse(value);
      return;
    }
    const object = value as Record<string, unknown>;
    if (typeof object.document === "string") {
      const s = sourceByDocument.get(object.document);
      if (!s) throw new Error("capital_contract_source_version_missing");
      used.add(s.document); anchors.push({path, ...s});
    }
    if (typeof object.perimeter === "string" && object.perimeter !== input.perimeter) throw new Error("capital_contract_perimeter_mismatch");
    if (typeof object.unit === "string" && object.unit !== input.currency) throw new Error("capital_contract_normalized_currency_required");
    for (const [key, v] of Object.entries(object)) visit(v, `${path}.${key}`, depth + 1);
  }
  visit(input.interest, "interest", 0); visit(input.covenants, "covenants", 0); visit(input.interestConventions, "interestConventions", 0);
  if (used.size !== input.sources.length) throw new Error("capital_contract_unused_source");
  if ((input.interest && input.interest.referenceDate !== input.asOf) || (input.covenants && input.covenants.asOfDate !== input.asOf)) throw new Error("capital_contract_measurement_mismatch");
  const interest = input.interest ? executors.buildInterestAndIndexationScheduleWithConventions(input.interest, input.interestConventions) : null;
  const covenants = input.covenants ? executors.reconcileCovenantDefinitions(input.covenants) : null;
  const payload = {schemaVersion: "capital-contract-preparation.v1" as const, financialCoreVersion,
    scope: {workId: input.workId, purpose: input.purpose, entityId: input.entityId, perimeter: input.perimeter,
      scenario: input.scenario, currency: input.currency, asOf: input.asOf},
    state: "candidate_contributions" as const,
    inputs: {interest: input.interest, interestConventions: input.interestConventions, covenants: input.covenants}, inputFingerprint: fingerprint(input),
    interest, covenants, sourceBindings: anchors,
    sourceVersionIds: input.sources.map(s => s.sourceVersionId), observationIds: [...new Set(input.sources.flatMap(s => s.observationIds))],
    requiredReviews: ["source_extraction", "contractual_applicability", "rounding_and_calendar", "waiver_cure_and_legal_effects", "contextual_adoption"] as const,
    mutatesWorkingBasis: false as const, certifiesContractualCompliance: false as const, grantsAccess: false as const, grantsExecution: false as const};
  return {...payload, fingerprint: fingerprint(payload)};
}
