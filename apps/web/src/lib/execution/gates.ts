import {EXECUTION_GATES_SCHEMA_VERSION, executionCanonicalText, executionGatesSchema, type ExecutionGates} from "@offroad/agent-contracts";
import {
  auditVoice, evaluateConventionsGate, MethodSelectionRefusal, methodSelectionVersion, selectMethod, VOICE_FILTER_VERSION,
  type ConventionsGateResult, type MethodSelectionRecord, type MethodSelectionRefusalCode, type VoiceFinding, type VoiceString,
} from "@offroad/credit-playbook";
import type {ExecutionBasisCompany} from "./contract";
import type {ExecutionGateRefusal} from "./failure";

/**
 * The professional gates of one capital execution request, assembled by the web action around
 * the published method, whose bytes never change. Nothing here writes professional content: the
 * catalogues, the rules and the procedure texts come from `@offroad/credit-playbook`, the company
 * states come from the server basis, and the result is the closed receipt the v2 producer stores.
 */
export const executionGatesVersion = "2026.09.24-v1";

type MethodIdentity = {methodId: string; methodVersion: string};

/**
 * `reference_data_keys` of every released method version this screen can request. Neither the
 * released profile the basis returns nor the compiled manifest carries them, so they are copied
 * from the frontmatter of the procedure the release pinned, and `gates.test.ts` checks the copy
 * against the source bytes of that release. A version missing here cannot be requested: the
 * conventions gate would have no keys to read, and an empty list would pass for "no convention".
 */
export const releasedMethodReferenceDataKeys: Readonly<Record<string, readonly string[]>> = {
  "prepare-capital-structure-decision@2026.09.21-v4": ["policy.capital.iof", "policy.capital.anbima-b3-conventions", "policy.capital.tax-regime"],
};

export function referenceDataKeysOf(method: MethodIdentity): readonly string[] | null {
  return releasedMethodReferenceDataKeys[`${method.methodId}@${method.methodVersion}`] ?? null;
}

const selectionRefusals: Record<MethodSelectionRefusalCode, ExecutionGateRefusal> = {
  input_invalid: "selection_invalid",
  situation_required: "situation_required",
  situation_unknown: "situation_unknown",
  method_not_applicable_for_situation: "method_not_applicable",
};

/** A typed refusal of the method selection, as the named code the screen translates. */
export const selectionRefusal = (code: MethodSelectionRefusalCode): ExecutionGateRefusal => selectionRefusals[code];

/** The gate states one request carries into its receipt. */
export type ExecutionGateStates = {
  company: Pick<ExecutionBasisCompany, "registration" | "research">;
  method: MethodIdentity;
  /** The selection record, or the situations a refused selection was asked for. */
  selection: MethodSelectionRecord | {refused: MethodSelectionRefusalCode; situationIds: readonly string[]};
  conventions: ConventionsGateResult;
  findings: readonly VoiceFinding[];
};

/** The first gate that blocks the request, in the order the action checks them. */
export function blockingRefusal(states: ExecutionGateStates): ExecutionGateRefusal | null {
  if (states.company.registration === "missing") return "company_unregistered";
  if ("refused" in states.selection) return selectionRefusal(states.selection.refused);
  if (states.findings.some(finding => finding.severity === "block")) return "voice_blocked";
  return null;
}

/**
 * The closed receipt of the gates: tokens, states and counts only. The registry owner and the gap
 * reason of a convention, the labels of a situation and the text of a voice finding stay out, as
 * the receipt schema requires. `blocked` is true exactly when a gate refuses the request.
 */
export function buildExecutionGates(states: ExecutionGateStates): ExecutionGates {
  const situationIds = "refused" in states.selection ? [...new Set(states.selection.situationIds)] : states.selection.situations.map(situation => situation.situationId);
  return executionGatesSchema.parse({
    schemaVersion: EXECUTION_GATES_SCHEMA_VERSION,
    gatesVersion: executionGatesVersion,
    blocked: blockingRefusal(states) !== null,
    companyRegistration: states.company.registration,
    research: states.company.research,
    methodSelection: {selectionVersion: methodSelectionVersion, situationIds, methodId: states.method.methodId, methodVersion: states.method.methodVersion},
    conventions: states.conventions.entries.map(({key, version, status, effective}) => ({key, version, status, effective})),
    voice: {
      version: VOICE_FILTER_VERSION,
      blockCount: states.findings.filter(finding => finding.severity === "block").length,
      warnCount: states.findings.filter(finding => finding.severity === "warn").length,
    },
  });
}

/** The exact bytes the producer stores and fingerprints: the house canonical text of a parsed
 * receipt. A blocked receipt has no text, so it can never be sent. */
export function executionGatesText(gates: ExecutionGates): string {
  const parsed = executionGatesSchema.parse(gates);
  if (parsed.blocked) throw new Error("execution_gates_blocked_not_sent");
  return executionCanonicalText(parsed);
}

/** Keys under which the packet composer writes prose of its own: labels, reasons, conditions. */
const systemProseKeys = new Set(["label", "rationale", "conditions", "disconfirmers", "missingReason", "coverageReason"]);
/** What the person typed. A person's own words are theirs and are never audited. */
const personPaths = new Set(["decision.review.composition.question", "decision.review.composition.objectives"]);

/**
 * The strings the system writes into a composed packet input, each with its path. The envelope is
 * the persisted working basis, copied verbatim, and is not system text either; identities, dates,
 * codes and field paths are not prose and are left out. A basis value the composer quotes inside
 * a reason (a scenario label, a field path) is part of that reason and is audited with it.
 */
export function packetSystemStrings(packet: unknown): VoiceString[] {
  const strings: VoiceString[] = [];
  const visit = (node: unknown, path: string, prose: boolean): void => {
    if (personPaths.has(path)) return;
    if (typeof node === "string") {
      if (prose) strings.push({id: path, text: node});
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${path}[${index}]`, prose));
      return;
    }
    if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        if (key === "envelope") continue;
        visit(value, path ? `${path}.${key}` : key, systemProseKeys.has(key));
      }
    }
  };
  visit(packet, "", false);
  return strings;
}

export type OpenedExecutionGates = Omit<ExecutionGateStates, "selection" | "findings"> & {selection: MethodSelectionRecord};

/**
 * The gates that need no packet, checked before anything is composed or sent: the company must be
 * registered (research that is missing is only recorded), the released method version must be one
 * whose reference data keys are known, and the selected situations must be served by the method.
 */
export function openExecutionGates(input: {company: ExecutionBasisCompany; method: MethodIdentity; situationIds: readonly string[]; referenceDate: string}):
  {ok: false; error: ExecutionGateRefusal | "method_unavailable"} | ({ok: true} & OpenedExecutionGates) {
  const company = {registration: input.company.registration, research: input.company.research};
  if (company.registration === "missing") return {ok: false, error: "company_unregistered"};
  const keys = referenceDataKeysOf(input.method);
  if (!keys) return {ok: false, error: "method_unavailable"};
  const method = {methodId: input.method.methodId, methodVersion: input.method.methodVersion};
  let selection: MethodSelectionRecord;
  try {
    selection = selectMethod({situationIds: [...input.situationIds], ...method});
  } catch (error) {
    if (error instanceof MethodSelectionRefusal) return {ok: false, error: selectionRefusal(error.code)};
    throw error;
  }
  return {ok: true, company, method, selection, conventions: evaluateConventionsGate(keys, input.referenceDate)};
}

/**
 * The voice gate over the composed packet, then the receipt. A block finding refuses the request
 * and its receipt is never serialized; warn findings are only counted.
 */
export function closeExecutionGates(opened: OpenedExecutionGates, packet: unknown):
  {ok: false; error: ExecutionGateRefusal; gates: ExecutionGates; findings: VoiceFinding[]} | {ok: true; gates: ExecutionGates; text: string; findings: VoiceFinding[]} {
  const findings = auditVoice(packetSystemStrings(packet), {channel: "packet"});
  const states: ExecutionGateStates = {company: opened.company, method: opened.method, selection: opened.selection, conventions: opened.conventions, findings};
  const gates = buildExecutionGates(states);
  const refusal = blockingRefusal(states);
  if (refusal) return {ok: false, error: refusal, gates, findings};
  return {ok: true, gates, text: executionGatesText(gates), findings};
}
