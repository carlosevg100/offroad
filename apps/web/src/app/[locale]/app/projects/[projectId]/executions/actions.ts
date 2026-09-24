"use server";

import {randomUUID} from "node:crypto";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {executionCanonicalText} from "@offroad/agent-contracts";
import {composeBoundCapitalPacketV2, deriveBoundCapitalScope} from "@offroad/financial-model";
import {readContextualBasis} from "@offroad/reconciliation";
import {requireWorkspace} from "@/lib/auth/workspace";
import {capitalDecisionPurpose} from "@/lib/advisor/adoption-basis-reader";
import {composeExecutionContract, contractBasisVersions, executionContractBasisSchema, executionContractText, type ExecutionContractBasis} from "@/lib/execution/contract";
import {executionRequestFailure, type ExecutionRequestError} from "@/lib/execution/failure";
import {closeExecutionGates, openExecutionGates} from "@/lib/execution/gates";

const route = z.object({locale: z.enum(["pt-BR", "en-US"]), projectId: z.uuid()});
const text = z.string().trim().min(1).max(2000);
type Failure = {ok: false; error: ExecutionRequestError; unverifiedSources?: ExecutionContractBasis["unverifiedSources"]};
type Success = {ok: true; executionId: string; replayed: boolean};
const failure = (error: {code?: string; message?: string} | null | undefined): Failure => ({ok: false, error: executionRequestFailure(error)});
const refused = (error: ExecutionRequestError): Failure => ({ok: false, error});

/** One execution of the released capital method over one working basis. The server assembles
 * identity, authority, the released profile, the pins and the company block; this action composes
 * the bound packet, the contract and the professional gates from that basis only and submits the
 * three texts. A gate that blocks refuses here, before anything is sent. The request id is chosen
 * by the caller once per form content, so a repeated submission never creates a second execution. */
export async function requestCapitalExecution(input: unknown): Promise<Success | Failure> {
  const parsed = route.extend({versionId: z.uuid(), requestId: z.uuid(), question: text, objectives: z.array(text).min(1).max(30), asOf: z.iso.date(),
    // The selection itself decides whether the list is empty or unknown, so it can name the refusal.
    situationIds: z.array(z.string().max(80)).max(32)}).strict().safeParse(input);
  if (!parsed.success) return failure({code: "22023"});
  const {locale, projectId, versionId, requestId, question, objectives, asOf, situationIds} = parsed.data;
  const {supabase, organization} = await requireWorkspace(locale);
  const project = await supabase.from("capital_projects").select("id").eq("organization_id", organization.id).eq("id", projectId).maybeSingle();
  if (!project.data) return failure({code: "42501"});
  const assembled = await supabase.rpc("execution_contract_basis_v2", {p_work_id: projectId, p_version_id: versionId});
  if (assembled.error) return failure(assembled.error);
  const basis = executionContractBasisSchema.safeParse(assembled.data);
  if (!basis.success || basis.data.workId !== projectId || basis.data.versionId !== versionId || basis.data.purpose !== capitalDecisionPurpose) return failure({code: "22023"});
  // The company comes before its use: an unregistered company refuses here, while research that
  // is missing only goes to the receipt as a recorded gap.
  const opened = openExecutionGates({company: basis.data.company, method: basis.data.profile.method, situationIds, referenceDate: asOf});
  if (!opened.ok) return refused(opened.error);
  // Every adopted source must be pinned with verified bytes and current rights, or the database
  // refuses the payload; naming the sources here spares the round trip and says which ones.
  if (basis.data.unverifiedSources.length) return {ok: false, error: "provenance_denied", unverifiedSources: basis.data.unverifiedSources};
  let contractText: string; let snapshotText: string; let packet: unknown; let pinned: string[];
  try {
    const scope = {workId: projectId, purpose: basis.data.purpose, versionId};
    const snapshot = readContextualBasis(basis.data.envelope, scope);
    packet = composeBoundCapitalPacketV2({envelope: basis.data.envelope, scope, question, objectives, asOf, ...deriveBoundCapitalScope(snapshot, asOf)});
    snapshotText = executionCanonicalText(packet);
    const contract = composeExecutionContract(basis.data, snapshotText, {executionId: randomUUID(), requestId, processingRunId: randomUUID(), snapshotId: randomUUID()});
    contractText = executionContractText(contract);
    pinned = contractBasisVersions(contract);
  } catch { return failure({code: "22023"}); }
  // The gates are evaluated over one basis version, and the producer accepts only a contract that
  // pins exactly that one.
  if (pinned.length !== 1 || pinned[0] !== versionId) return failure({code: "22023"});
  // A receipt that cannot be built as the closed schema is never sent in any other shape.
  let closed: ReturnType<typeof closeExecutionGates>;
  try { closed = closeExecutionGates(opened, packet); } catch { return refused("gates_invalid"); }
  if (!closed.ok) return refused(closed.error);
  const requested = await supabase.rpc("request_work_execution_v2", {p_contract_text: contractText, p_snapshot_text: snapshotText, p_gates_text: closed.text});
  if (requested.error) {
    // A retry carries a new timestamp, so its bytes differ from the first submission. The database
    // kept the execution this human's request already created and names it in the error detail.
    if (requested.error.code === "23505" && requested.error.message.includes("execution_request_conflict")) {
      const prior = z.uuid().safeParse(requested.error.details ?? "");
      return prior.success ? {ok: true, executionId: prior.data, replayed: true} : {ok: false, error: "conflict"};
    }
    return failure(requested.error);
  }
  const result = z.object({executionId: z.uuid(), replayed: z.boolean()}).loose().safeParse(requested.data);
  if (!result.success) return failure(null);
  revalidatePath(`/${locale}/app/projects/${projectId}/executions`);
  return {ok: true, executionId: result.data.executionId, replayed: result.data.replayed};
}
