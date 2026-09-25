"use server";

import {randomUUID} from "node:crypto";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {composeCapitalExecutionRequest, executionContractBasisSchema, type ExecutionContractBasis} from "@offroad/execution-request";
import {requireWorkspace} from "@/lib/auth/workspace";
import {capitalDecisionPurpose} from "@/lib/advisor/adoption-basis-reader";
import {executionRequestFailure, type ExecutionRequestError} from "@/lib/execution/failure";

const route = z.object({locale: z.enum(["pt-BR", "en-US"]), projectId: z.uuid()});
const text = z.string().trim().min(1).max(2000);
type Failure = {ok: false; error: ExecutionRequestError; unverifiedSources?: ExecutionContractBasis["unverifiedSources"]};
type Success = {ok: true; executionId: string; replayed: boolean};
const failure = (error: {code?: string; message?: string} | null | undefined): Failure => ({ok: false, error: executionRequestFailure(error)});
const refused = (error: ExecutionRequestError): Failure => ({ok: false, error});

/** One execution of the released capital method over one working basis. The server assembles
 * identity, authority, the released profile, the pins and the company block; the shared
 * composition (`@offroad/execution-request`, also used by the worker's dependency recompute)
 * builds the bound packet, the contract and the professional gates from that basis only, and this
 * action submits the three texts. A gate that blocks refuses here, before anything is sent. The
 * request id is chosen by the caller once per form content, so a repeated submission never creates
 * a second execution. */
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
  // The company comes before its use: an unregistered company refuses before anything else, while
  // research that is missing only goes to the receipt as a recorded gap; every adopted source must
  // be pinned with verified bytes and current rights, and the contract must pin exactly the one
  // basis version the gates were evaluated over.
  const composed = composeCapitalExecutionRequest({basis: basis.data, ask: {question, objectives, asOf, situationIds},
    ids: {executionId: randomUUID(), requestId, processingRunId: randomUUID(), snapshotId: randomUUID()}});
  if (!composed.ok) {
    if (composed.error === "provenance_denied") return {ok: false, error: "provenance_denied", unverifiedSources: composed.unverifiedSources};
    if (composed.error === "composition_invalid") return failure({code: "22023"});
    return refused(composed.error);
  }
  const requested = await supabase.rpc("request_work_execution_v2", {p_contract_text: composed.contractText, p_snapshot_text: composed.snapshotText, p_gates_text: composed.gatesText});
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
