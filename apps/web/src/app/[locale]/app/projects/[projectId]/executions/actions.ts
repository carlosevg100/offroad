"use server";

import {randomUUID} from "node:crypto";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {executionCanonicalText} from "@offroad/agent-contracts";
import {composeBoundCapitalPacketV2, deriveBoundCapitalScope} from "@offroad/financial-model";
import {readContextualBasis} from "@offroad/reconciliation";
import {requireWorkspace} from "@/lib/auth/workspace";
import {capitalDecisionPurpose} from "@/lib/advisor/adoption-basis-reader";
import {composeExecutionContract, executionContractBasisSchema, executionContractText, type ExecutionContractBasis} from "@/lib/execution/contract";
import {executionRequestFailure, type ExecutionRequestError} from "@/lib/execution/failure";
import {workExecutionListSchema} from "@/lib/execution/read";

const route = z.object({locale: z.enum(["pt-BR", "en-US"]), projectId: z.uuid()});
const text = z.string().trim().min(1).max(2000);
type Failure = {ok: false; error: ExecutionRequestError; unverifiedSources?: ExecutionContractBasis["unverifiedSources"]};
type Success = {ok: true; executionId: string; replayed: boolean};
const failure = (error: {code?: string; message?: string} | null | undefined): Failure => ({ok: false, error: executionRequestFailure(error)});

/** One execution of the released capital method over one working basis. The server assembles
 * identity, authority, the released profile and the pins; this action composes the bound packet
 * and the contract from that basis only and submits both texts. The request id is chosen by the
 * caller once per form content, so a repeated submission never creates a second execution. */
export async function requestCapitalExecution(input: unknown): Promise<Success | Failure> {
  const parsed = route.extend({versionId: z.uuid(), requestId: z.uuid(), question: text, objectives: z.array(text).min(1).max(30), asOf: z.iso.date()}).strict().safeParse(input);
  if (!parsed.success) return failure({code: "22023"});
  const {locale, projectId, versionId, requestId, question, objectives, asOf} = parsed.data;
  const {supabase, organization} = await requireWorkspace(locale);
  const project = await supabase.from("capital_projects").select("id").eq("organization_id", organization.id).eq("id", projectId).maybeSingle();
  if (!project.data) return failure({code: "42501"});
  const assembled = await supabase.rpc("execution_contract_basis_v1", {p_work_id: projectId, p_version_id: versionId});
  if (assembled.error) return failure(assembled.error);
  const basis = executionContractBasisSchema.safeParse(assembled.data);
  if (!basis.success || basis.data.workId !== projectId || basis.data.versionId !== versionId || basis.data.purpose !== capitalDecisionPurpose) return failure({code: "22023"});
  // Every adopted source must be pinned with verified bytes and current rights, or the database
  // refuses the payload; naming the sources here spares the round trip and says which ones.
  if (basis.data.unverifiedSources.length) return {ok: false, error: "provenance_denied", unverifiedSources: basis.data.unverifiedSources};
  let contractText: string; let snapshotText: string;
  try {
    const scope = {workId: projectId, purpose: basis.data.purpose, versionId};
    const snapshot = readContextualBasis(basis.data.envelope, scope);
    const packet = composeBoundCapitalPacketV2({envelope: basis.data.envelope, scope, question, objectives, asOf, ...deriveBoundCapitalScope(snapshot, asOf)});
    snapshotText = executionCanonicalText(packet);
    contractText = executionContractText(composeExecutionContract(basis.data, snapshotText, {executionId: randomUUID(), requestId, processingRunId: randomUUID(), snapshotId: randomUUID()}));
  } catch { return failure({code: "22023"}); }
  const requested = await supabase.rpc("request_work_execution_v1", {p_contract_text: contractText, p_snapshot_text: snapshotText});
  if (requested.error) {
    const refused = failure(requested.error);
    if (refused.error !== "conflict") return refused;
    // The same request id was submitted before with other bytes (a retry carries a new
    // timestamp). The database kept the first execution; point at it instead of failing.
    const listed = await supabase.rpc("list_work_executions_v1", {p_work_id: projectId});
    const prior = listed.error ? null : workExecutionListSchema.safeParse(listed.data).data?.find(row => row.requestId === requestId) ?? null;
    if (!prior) return refused;
    return {ok: true, executionId: prior.executionId, replayed: true};
  }
  const result = z.object({executionId: z.uuid(), replayed: z.boolean()}).loose().safeParse(requested.data);
  if (!result.success) return failure(null);
  revalidatePath(`/${locale}/app/projects/${projectId}/executions`);
  return {ok: true, executionId: result.data.executionId, replayed: result.data.replayed};
}
