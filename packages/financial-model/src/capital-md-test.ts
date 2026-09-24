import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {z} from "zod";
import {MD_TEST_RUBRIC, MD_TEST_RUBRIC_VERSION, structuringSituations, type MdTestQuestionId} from "@offroad/credit-playbook";
import {capitalPacketPathSchema} from "./capital-chart-series";
import {capitalProcedurePacketOutputSchema} from "./capital-procedure-packet";
import {capitalProcedurePacketV2OutputSchema} from "./capital-procedure-packet-v2";

/**
 * Deterministic evaluator of the MD test (section Q1 of `prepare-capital-structure-decision.md`)
 * over the rubric `MD_TEST_RUBRIC` of `@offroad/credit-playbook`, reading the capital procedure
 * packet (v2, or v1 of the same shape) and the gate states.
 *
 * Every question ends as `pass`, `fail` with reason codes, `not_applicable` with a scope code, or
 * `human_required` with a code, always with the paths it read (`packet.` for the packet, `gates.`
 * for the gate states). A question the rubric marks `human_required` is never evaluated here. The
 * result counts outcomes and carries no overall verdict: Q1 keeps approval with a human, and a
 * `not_applicable` is not a pass. The evaluator is identified as deterministic, as Q1 asks of any
 * automated review.
 *
 * Mapping, from the 4C plan:
 * - q1: question and objectives present, and at least one situation of the R3 catalogue selected.
 * - q2: sources pinned (every projection carries its adopted basis fingerprint, every market
 *   reference its source version, and contracts their source versions) and research recorded or
 *   abstained.
 * - q3: every alternative's `disconfirmers` not empty and `informationGaps` not empty.
 * - q4: with a recommendation, a status other than `framed` and the facts that would change it;
 *   without one, `nextRequirements` not empty, since Q1 accepts "what prevents an opinion" with a
 *   useful next step as a clear conclusion.
 * - q5: when the packet status is `prepared_for_human_review`, every alternative's projection rows
 *   and summary are not null; any other status is `not_applicable` with the status as scope.
 * - q6: gaps named (every gap has a code, and a status short of `prepared_for_human_review` names
 *   at least one gap, unresolved item or pending review domain) and, when an alternative's
 *   projection is calculated, a calculated sensitivity that is adverse: its available cash closes
 *   below its base alternative's in at least one period.
 * - q7: two alternatives or a maintenance exclusion; otherwise `not_applicable` with a scope code.
 * - q8 and q9: fingerprints (packet, input, decision, review and every calculation), `observationIds`
 *   (the packet list carries every decision observation, and a projection built on observations
 *   has observations listed) and the pinned-input requirement.
 * - q10: always `human_required`.
 *
 * The gate states for company registration, conventions and voice are validated and recorded in
 * the result, but no question of this mapping reads them.
 */
export const capitalMdTestVersion = "2026.09.24-v1";

/**
 * The gate states the MD test reads. A local structural input type: increment 4C-4 aligns it with
 * the gate receipt contract.
 */
export const capitalMdTestGatesSchema = z.strictObject({
  companyRegistration: z.enum(["registered", "missing"]),
  research: z.enum(["recorded", "abstained", "missing"]),
  methodSelection: z.strictObject({situationIds: z.array(z.string().min(1))}).nullable(),
  conventions: z.array(z.strictObject({key: z.string().min(1), effective: z.enum(["approved", "gap"])})),
  voice: z.strictObject({blockCount: z.number().int().nonnegative(), warnCount: z.number().int().nonnegative()}).nullable(),
});
export type CapitalMdTestGates = z.infer<typeof capitalMdTestGatesSchema>;

export const capitalMdTestFailCodes = [
  "question_missing",
  "objectives_missing",
  "situation_not_selected",
  "situation_unknown",
  "research_missing",
  "sources_unpinned",
  "disconfirmers_missing",
  "information_gaps_empty",
  "recommendation_status_incompatible",
  "recommendation_change_facts_missing",
  "next_requirements_missing",
  "projection_rows_missing",
  "gap_code_missing",
  "partial_status_without_named_gap",
  "adverse_sensitivity_missing",
  "fingerprint_missing",
  "observation_ids_incomplete",
  "observation_ids_missing",
  "pinned_input_not_required",
] as const;
export const capitalMdTestScopeCodes = [
  "packet_status_framed",
  "packet_status_partial",
  "no_alternatives",
  "single_alternative_without_maintenance_exclusion",
] as const;
export const capitalMdTestHumanCodes = ["rubric_human_required", "mapping_not_defined"] as const;
export const capitalMdTestStatuses = ["pass", "fail", "not_applicable", "human_required"] as const;

type FailCode = (typeof capitalMdTestFailCodes)[number];
type ScopeCode = (typeof capitalMdTestScopeCodes)[number];

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const questionIdSchema = z.enum(MD_TEST_RUBRIC.map((question) => question.id) as [MdTestQuestionId, ...MdTestQuestionId[]]);
const pathsSchema = z.array(capitalPacketPathSchema);
const count = z.number().int().nonnegative();

export const capitalMdTestQuestionResultSchema = z.discriminatedUnion("status", [
  z.strictObject({id: questionIdSchema, status: z.literal("pass"), paths: pathsSchema}),
  z.strictObject({id: questionIdSchema, status: z.literal("fail"), reasonCodes: z.array(z.enum(capitalMdTestFailCodes)).min(1), paths: pathsSchema}),
  z.strictObject({id: questionIdSchema, status: z.literal("not_applicable"), scopeCode: z.enum(capitalMdTestScopeCodes), paths: pathsSchema}),
  z.strictObject({id: questionIdSchema, status: z.literal("human_required"), reasonCode: z.enum(capitalMdTestHumanCodes), paths: pathsSchema}),
]);

const bodyShape = {
  schemaVersion: z.literal("capital-md-test.v1"),
  evaluator: z.strictObject({kind: z.literal("deterministic"), exportName: z.literal("evaluateMdTest"), version: z.literal(capitalMdTestVersion)}),
  rubricVersion: z.literal(MD_TEST_RUBRIC_VERSION),
  packet: z.strictObject({
    schemaVersion: z.enum(["capital-procedure-packet.v1", "capital-procedure-packet.v2"]),
    status: z.enum(["framed", "partial", "prepared_for_human_review"]),
    fingerprint: hash,
  }),
  /** The gate states received, recorded as evidence of the evaluation. */
  gates: capitalMdTestGatesSchema,
  questions: z.array(capitalMdTestQuestionResultSchema).length(MD_TEST_RUBRIC.length),
  /** Outcome counts only; there is deliberately no overall verdict. */
  overall: z.strictObject({deterministicPass: count, fail: count, notApplicable: count, humanRequired: count}),
};
const bodySchema = z.strictObject(bodyShape);
export const capitalMdTestResultSchema = z.strictObject({...bodyShape, fingerprint: hash});

export type CapitalMdTestQuestionResult = z.infer<typeof capitalMdTestQuestionResultSchema>;
export type CapitalMdTestResult = z.infer<typeof capitalMdTestResultSchema>;

const packetSchema = z.discriminatedUnion("schemaVersion", [capitalProcedurePacketOutputSchema, capitalProcedurePacketV2OutputSchema]);
const inputSchema = z.strictObject({packet: packetSchema, gates: capitalMdTestGatesSchema});
type Packet = z.infer<typeof packetSchema>;
type Context = {packet: Packet; gates: CapitalMdTestGates};

/** A question outcome before the rubric id is attached. */
type Outcome =
  | {status: "pass"; paths: string[]}
  | {status: "fail"; reasonCodes: FailCode[]; paths: string[]}
  | {status: "not_applicable"; scopeCode: ScopeCode; paths: string[]};

const Exact = Decimal.clone({precision: 100, rounding: Decimal.ROUND_HALF_UP});
const knownSituations = new Set<string>(structuringSituations.map((situation) => situation.situationId));
const isHash = (value: string) => /^[a-f0-9]{64}$/.test(value);
const blank = (value: string) => value.trim().length === 0;

function outcome(failures: readonly FailCode[], paths: readonly string[]): Outcome {
  const unique = [...new Set(paths)];
  return failures.length ? {status: "fail", reasonCodes: [...new Set(failures)], paths: unique} : {status: "pass", paths: unique};
}

/** Every projection of the packet with its path: alternatives first, then sensitivities. */
function projections(packet: Packet) {
  return [
    ...packet.decision.alternatives.map((alternative, index) => ({path: `packet.decision.alternatives[${index}].projection`, projection: alternative.projection})),
    ...packet.decision.sensitivities.map((sensitivity, index) => ({path: `packet.decision.sensitivities[${index}].projection`, projection: sensitivity.projection})),
  ];
}

function q1({packet, gates}: Context): Outcome {
  const paths = ["packet.decision.question", "packet.decision.objectives"];
  const failures: FailCode[] = [];
  if (blank(packet.decision.question)) failures.push("question_missing");
  if (!packet.decision.objectives.some((objective) => !blank(objective))) failures.push("objectives_missing");
  if (gates.methodSelection === null) {
    paths.push("gates.methodSelection");
    failures.push("situation_not_selected");
  } else {
    paths.push("gates.methodSelection.situationIds");
    const ids = gates.methodSelection.situationIds;
    if (ids.length === 0) failures.push("situation_not_selected");
    else if (ids.some((id) => !knownSituations.has(id))) failures.push("situation_unknown");
  }
  return outcome(failures, paths);
}

function q2({packet, gates}: Context): Outcome {
  const paths = ["gates.research"];
  const failures: FailCode[] = [];
  if (gates.research === "missing") failures.push("research_missing");
  for (const {path, projection} of projections(packet)) {
    paths.push(`${path}.basisFingerprint`);
    if (!isHash(projection.basisFingerprint)) failures.push("sources_unpinned");
  }
  packet.decision.marketReferences.forEach((reference, index) => {
    paths.push(`packet.decision.marketReferences[${index}].sourceVersionId`);
    if (blank(reference.sourceVersionId)) failures.push("sources_unpinned");
  });
  if (packet.contracts.length > 0) {
    paths.push("packet.contracts", "packet.contractSourceVersionIds");
    if (packet.contractSourceVersionIds.length === 0) failures.push("sources_unpinned");
  }
  return outcome(failures, paths);
}

function q3({packet}: Context): Outcome {
  const paths: string[] = [];
  const failures: FailCode[] = [];
  packet.decision.alternatives.forEach((alternative, index) => {
    paths.push(`packet.decision.alternatives[${index}].disconfirmers`);
    if (!alternative.disconfirmers.some((entry) => !blank(entry))) failures.push("disconfirmers_missing");
  });
  paths.push("packet.decision.informationGaps");
  if (packet.decision.informationGaps.length === 0) failures.push("information_gaps_empty");
  return outcome(failures, paths);
}

function q4({packet}: Context): Outcome {
  const paths = ["packet.status", "packet.decision.recommendation"];
  const failures: FailCode[] = [];
  const recommendation = packet.decision.recommendation;
  if (recommendation) {
    paths.push("packet.decision.recommendation.wouldChangeIf");
    if (packet.status === "framed") failures.push("recommendation_status_incompatible");
    if (!recommendation.wouldChangeIf.some((entry) => !blank(entry))) failures.push("recommendation_change_facts_missing");
  } else {
    paths.push("packet.decision.nextRequirements");
    if (packet.decision.nextRequirements.length === 0) failures.push("next_requirements_missing");
  }
  return outcome(failures, paths);
}

function q5({packet}: Context): Outcome {
  if (packet.status !== "prepared_for_human_review") {
    return {status: "not_applicable", scopeCode: packet.status === "framed" ? "packet_status_framed" : "packet_status_partial", paths: ["packet.status"]};
  }
  const paths = ["packet.status"];
  const failures: FailCode[] = [];
  packet.decision.alternatives.forEach((alternative, index) => {
    const path = `packet.decision.alternatives[${index}].projection`;
    paths.push(`${path}.rows`, `${path}.summary`);
    if (alternative.projection.rows === null || alternative.projection.summary === null) failures.push("projection_rows_missing");
  });
  if (packet.decision.alternatives.length === 0) failures.push("projection_rows_missing");
  return outcome(failures, paths);
}

function q6({packet}: Context): Outcome {
  const decision = packet.decision;
  const paths = ["packet.status", "packet.decision.informationGaps", "packet.contractualGaps", "packet.decision.unresolved", "packet.decision.pendingReviewDomains"];
  const failures: FailCode[] = [];
  if ([...decision.informationGaps, ...packet.contractualGaps].some((gap) => blank(gap.code))) failures.push("gap_code_missing");
  const named = decision.informationGaps.length + packet.contractualGaps.length + decision.unresolved.length + decision.pendingReviewDomains.length;
  if (packet.status !== "prepared_for_human_review" && named === 0) failures.push("partial_status_without_named_gap");
  const calculated = decision.alternatives.flatMap((alternative, index) => (alternative.projection.rows === null ? [] : [index]));
  if (calculated.length > 0) {
    calculated.forEach((index) => paths.push(`packet.decision.alternatives[${index}].projection.rows`));
    let adverse = false;
    decision.sensitivities.forEach((sensitivity, index) => {
      paths.push(`packet.decision.sensitivities[${index}].baseAlternativeId`, `packet.decision.sensitivities[${index}].projection.rows`);
      const base = decision.alternatives.find((alternative) => alternative.id === sensitivity.baseAlternativeId);
      const rows = sensitivity.projection.rows;
      if (!base || base.projection.rows === null || rows === null) return;
      const baseClosing = new Map(base.projection.rows.map((row) => [row.periodId, row.closingAvailable]));
      if (rows.some((row) => {
        const closing = baseClosing.get(row.periodId);
        return closing !== undefined && new Exact(row.closingAvailable).lt(closing);
      })) adverse = true;
    });
    if (!adverse) failures.push("adverse_sensitivity_missing");
  }
  return outcome(failures, paths);
}

function q7({packet}: Context): Outcome {
  const paths = ["packet.decision.alternatives", "packet.decision.maintenanceExclusion"];
  const alternatives = packet.decision.alternatives.length;
  if (alternatives >= 2 || packet.decision.maintenanceExclusion !== null) return {status: "pass", paths};
  return {status: "not_applicable", scopeCode: alternatives === 0 ? "no_alternatives" : "single_alternative_without_maintenance_exclusion", paths};
}

/** q8 and q9 share the mapping: the packet stands on its own record. */
function provenance({packet}: Context): Outcome {
  const decision = packet.decision;
  const failures: FailCode[] = [];
  const fingerprints: Array<[string, string]> = [
    ["packet.fingerprint", packet.fingerprint],
    ["packet.inputFingerprint", packet.inputFingerprint],
    ["packet.decision.fingerprint", decision.fingerprint],
    ["packet.decision.provenance.inputFingerprint", decision.provenance.inputFingerprint],
    ["packet.decision.provenance.reviewFingerprint", decision.provenance.reviewFingerprint],
    ...projections(packet).map(({path, projection}): [string, string] => [`${path}.calculationFingerprint`, projection.calculationFingerprint]),
  ];
  if (fingerprints.some(([, value]) => !isHash(value))) failures.push("fingerprint_missing");
  const paths = fingerprints.map(([path]) => path);
  paths.push("packet.observationIds", "packet.decision.provenance.observationIds");
  const listed = new Set(packet.observationIds);
  if (decision.provenance.observationIds.some((id) => !listed.has(id))) failures.push("observation_ids_incomplete");
  for (const {path, projection} of projections(packet)) {
    paths.push(`${path}.contributionIds`, `${path}.hypothesisIds`);
    const hypotheses = new Set(projection.hypothesisIds);
    const observed = projection.contributionIds.some((id) => !hypotheses.has(id));
    if (observed && decision.provenance.observationIds.length === 0) failures.push("observation_ids_missing");
  }
  paths.push("packet.requiresPinnedInputAndManifest", "packet.decision.provenance.requiresPinnedInputAndManifest");
  if (packet.requiresPinnedInputAndManifest !== true || decision.provenance.requiresPinnedInputAndManifest !== true) failures.push("pinned_input_not_required");
  return outcome(failures, paths);
}

const mappings: Partial<Record<MdTestQuestionId, (context: Context) => Outcome>> = {
  q1, q2, q3, q4, q5, q6, q7, q8: provenance, q9: provenance,
};

export function evaluateMdTest(input: {packet: unknown; gates: CapitalMdTestGates}): CapitalMdTestResult {
  const context = inputSchema.parse(input);
  const questions: CapitalMdTestQuestionResult[] = MD_TEST_RUBRIC.map((question) => {
    if (question.evaluation === "human_required") return {id: question.id, status: "human_required", reasonCode: "rubric_human_required", paths: []};
    const evaluate = mappings[question.id];
    if (!evaluate) return {id: question.id, status: "human_required", reasonCode: "mapping_not_defined", paths: []};
    return {id: question.id, ...evaluate(context)};
  });
  const tally = (status: (typeof capitalMdTestStatuses)[number]) => questions.filter((question) => question.status === status).length;
  const body = bodySchema.parse({
    schemaVersion: "capital-md-test.v1",
    evaluator: {kind: "deterministic", exportName: "evaluateMdTest", version: capitalMdTestVersion},
    rubricVersion: MD_TEST_RUBRIC_VERSION,
    packet: {schemaVersion: context.packet.schemaVersion, status: context.packet.status, fingerprint: context.packet.fingerprint},
    gates: context.gates,
    questions,
    overall: {deterministicPass: tally("pass"), fail: tally("fail"), notApplicable: tally("not_applicable"), humanRequired: tally("human_required")},
  });
  return capitalMdTestResultSchema.parse({...body, fingerprint: createHash("sha256").update(JSON.stringify(body)).digest("hex")});
}
