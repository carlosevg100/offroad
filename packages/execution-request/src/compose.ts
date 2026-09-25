import {executionCanonicalText, type ExecutionContract, type ExecutionGates} from "@offroad/agent-contracts";
import {composeBoundCapitalPacketV2, deriveBoundCapitalScope} from "@offroad/financial-model";
import {readContextualBasis} from "@offroad/reconciliation";
import {composeExecutionContract, contractBasisVersions, executionContractText, type ExecutionContractBasis, type ExecutionRequestIds} from "./contract";
import {closeExecutionGates, openExecutionGates} from "./gates";
import type {ExecutionGateRefusal} from "./refusal";

/** What was asked of an execution: the question, the objectives, the reference date and the situations. */
export type CapitalExecutionAsk = {question: string; objectives: readonly string[]; asOf: string; situationIds: readonly string[]};

export type CapitalExecutionRefusal = ExecutionGateRefusal | "method_unavailable" | "gates_invalid" | "composition_invalid";

export type CapitalExecutionComposition =
  | {ok: false; error: CapitalExecutionRefusal}
  | {ok: false; error: "provenance_denied"; unverifiedSources: ExecutionContractBasis["unverifiedSources"]}
  | {ok: true; contract: ExecutionContract; packet: unknown; gates: ExecutionGates; contractText: string; snapshotText: string; gatesText: string};

/**
 * One capital execution request, composed from the basis the server assembled for its requester
 * and from what was asked, in the order the request action has always followed: the gates that
 * need no packet (registration, released method, situations), the sources that must be pinned
 * with verified bytes, the bound packet over the working basis, the contract that pins exactly
 * that one basis version, then the voice gate and its closed receipt. The web action and the
 * worker's dependency recompute send the three texts this returns, byte for byte. Nothing here
 * reads a database, calls a model or sends anything.
 */
export function composeCapitalExecutionRequest(input: {basis: ExecutionContractBasis; ask: CapitalExecutionAsk; ids: ExecutionRequestIds; now?: Date}): CapitalExecutionComposition {
  const {basis, ask} = input;
  const opened = openExecutionGates({company: basis.company, method: basis.profile.method, situationIds: ask.situationIds, referenceDate: ask.asOf});
  if (!opened.ok) return {ok: false, error: opened.error};
  // Every adopted source must be pinned with verified bytes and current rights, or the database
  // refuses the payload; naming the sources here spares the round trip and says which ones.
  if (basis.unverifiedSources.length) return {ok: false, error: "provenance_denied", unverifiedSources: basis.unverifiedSources};
  let packet: unknown; let snapshotText: string; let contract: ExecutionContract; let contractText: string;
  try {
    const scope = {workId: basis.workId, purpose: basis.purpose, versionId: basis.versionId};
    const snapshot = readContextualBasis(basis.envelope, scope);
    packet = composeBoundCapitalPacketV2({envelope: basis.envelope, scope, question: ask.question, objectives: [...ask.objectives], asOf: ask.asOf, ...deriveBoundCapitalScope(snapshot, ask.asOf)});
    snapshotText = executionCanonicalText(packet);
    contract = composeExecutionContract(basis, snapshotText, input.ids, input.now);
    contractText = executionContractText(contract);
  } catch { return {ok: false, error: "composition_invalid"}; }
  // The gates are evaluated over one basis version, and the producer accepts only a contract that
  // pins exactly that one.
  const pinned = contractBasisVersions(contract);
  if (pinned.length !== 1 || pinned[0] !== basis.versionId) return {ok: false, error: "composition_invalid"};
  // A receipt that cannot be built as the closed schema is never sent in any other shape.
  let closed: ReturnType<typeof closeExecutionGates>;
  try { closed = closeExecutionGates(opened, packet); } catch { return {ok: false, error: "gates_invalid"}; }
  if (!closed.ok) return {ok: false, error: closed.error};
  return {ok: true, contract, packet, gates: closed.gates, contractText, snapshotText, gatesText: closed.text};
}
