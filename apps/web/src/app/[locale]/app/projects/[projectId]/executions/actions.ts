"use server";

import {randomUUID} from "node:crypto";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {composeCapitalExecutionRequest, composeMethodExecutionRequest, executionContractBasisSchema, type ExecutionContractBasis} from "@offroad/execution-request";
import {requireWorkspace} from "@/lib/auth/workspace";
import {capitalDecisionPurpose} from "@/lib/advisor/adoption-basis-reader";
import {executionRequestFailure, type ExecutionRequestError} from "@/lib/execution/failure";
import {executionRequestTextMaxLength} from "@/lib/execution/request-limits";

const route = z.object({locale: z.enum(["pt-BR", "en-US"]), projectId: z.uuid()});
const text = z.string().trim().min(1).max(executionRequestTextMaxLength);
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

const premiseDefinitionKey = "investment.premises";
const premiseDefinitionText = "Premissas de um investimento confirmadas pela pessoa na conversa: documento, informado ou premissa da casa, conforme a origem de cada uma.";
type PremiseSuccess = {ok: true; versionId: string; executionId: string | null; calculation: "requested" | "pending_release"};
type PremiseFailure = {ok: false; error: ExecutionRequestError | "company_unregistered" | "superseded"};

/** The person confirms the premises the conversation proposed. The company the dossier names as
 * its subject and the work's premise definition give every hypothesis its identity; the database
 * writes them all as this person in one transaction. Then the released investment method is asked
 * to calculate over exactly that basis version. Until the method is released and granted, the
 * premises stay confirmed and the calculation waits; nothing is invented to fill the gap. */
export async function confirmInvestmentPremises(input: unknown): Promise<PremiseSuccess | PremiseFailure> {
  const parsed = route.extend({proposalId: z.uuid(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/), requestId: z.uuid(), definitionRequestId: z.uuid()}).strict().safeParse(input);
  if (!parsed.success) return failure({code: "22023"});
  const {locale, projectId, proposalId, fingerprint, requestId, definitionRequestId} = parsed.data;
  const {supabase, organization} = await requireWorkspace(locale);
  const proposal = await supabase.from("work_premise_proposals").select("id, capital_project_id, intake_session_id, status, fingerprint, method_id")
    .eq("organization_id", organization.id).eq("id", proposalId).eq("capital_project_id", projectId).maybeSingle();
  if (!proposal.data) return failure({code: "42501"});
  if (proposal.data.status === "superseded" || proposal.data.fingerprint !== fingerprint) return {ok: false, error: "superseded"};
  const dossiers = await supabase.from("dossiers").select("id").eq("organization_id", organization.id).in("resource_id", [projectId, proposal.data.intake_session_id]);
  if (dossiers.error || !dossiers.data?.length) return {ok: false, error: "company_unregistered"};
  const now = new Date().toISOString();
  const subjects = await supabase.from("dossier_entity_links").select("dossier_id, entity_id").eq("organization_id", organization.id)
    .in("dossier_id", dossiers.data.map(d => d.id)).eq("relationship", "subject").is("withdrawn_at", null).or(`valid_until.is.null,valid_until.gt.${now}`).limit(2);
  const subject = subjects.data?.length === 1 ? subjects.data[0]! : null;
  if (!subject) return {ok: false, error: "company_unregistered"};
  const metric = await supabase.from("metric_definitions").select("id").eq("organization_id", organization.id).eq("dossier_id", subject.dossier_id).eq("metric_key", premiseDefinitionKey).maybeSingle();
  let definitionVersionId: string | null = null;
  if (metric.data) {
    const latest = await supabase.from("definition_versions").select("id").eq("organization_id", organization.id).eq("metric_definition_id", metric.data.id).order("version_no", {ascending: false}).limit(1).maybeSingle();
    definitionVersionId = latest.data?.id ?? null;
  }
  if (!definitionVersionId) {
    const sqlNull = null as never;
    const recorded = await supabase.rpc("record_definition_version_v1", {p_dossier_id: subject.dossier_id, p_metric_key: premiseDefinitionKey, p_kind: "managerial",
      p_definition: premiseDefinitionText, p_contract_source_version_id: sqlNull, p_contract_anchor: sqlNull, p_definition_id: sqlNull, p_expected_version: 0, p_request_id: definitionRequestId});
    if (recorded.error || !recorded.data) return failure(recorded.error);
    definitionVersionId = recorded.data;
  }
  const confirmed = await supabase.rpc("confirm_work_premise_proposal_v1", {p_proposal_id: proposalId, p_expected_fingerprint: fingerprint, p_entity_id: subject.entity_id, p_definition_version_id: definitionVersionId});
  if (confirmed.error || !confirmed.data) return failure(confirmed.error);
  const versionId = confirmed.data;
  revalidatePath(`/${locale}/app/projects/${projectId}`);
  // The released profile decides whether the method can run; an unreleased method leaves the premises confirmed.
  const assembled = await supabase.rpc("execution_contract_basis_v2", {p_work_id: projectId, p_version_id: versionId, p_method_id: proposal.data.method_id});
  if (assembled.error) return executionRequestFailure(assembled.error) === "method_unavailable" ? {ok: true, versionId, executionId: null, calculation: "pending_release"} : failure(assembled.error);
  const basis = executionContractBasisSchema.safeParse(assembled.data);
  if (!basis.success || basis.data.workId !== projectId || basis.data.versionId !== versionId || basis.data.purpose !== capitalDecisionPurpose) return failure({code: "22023"});
  const composed = composeMethodExecutionRequest({basis: basis.data,
    ask: {question: "O investimento se paga e deve seguir agora?", objectives: ["Medir valor, retorno, payback e caixa consumido pelo investimento e o que muda a conclusão"], asOf: now.slice(0, 10), situationIds: ["capex-infrastructure"]},
    ids: {executionId: randomUUID(), requestId, processingRunId: randomUUID(), snapshotId: randomUUID()}});
  if (!composed.ok) return composed.error === "method_unavailable" ? {ok: true, versionId, executionId: null, calculation: "pending_release"}
    : composed.error === "provenance_denied" || composed.error === "composition_invalid" ? failure({code: "22023"}) : refused(composed.error);
  const requested = await supabase.rpc("request_work_execution_v2", {p_contract_text: composed.contractText, p_snapshot_text: composed.snapshotText, p_gates_text: composed.gatesText});
  if (requested.error) {
    if (requested.error.code === "23505" && requested.error.message.includes("execution_request_conflict")) {
      const prior = z.uuid().safeParse(requested.error.details ?? "");
      if (prior.success) return {ok: true, versionId, executionId: prior.data, calculation: "requested"};
    }
    return failure(requested.error);
  }
  const result = z.object({executionId: z.uuid()}).loose().safeParse(requested.data);
  if (!result.success) return failure(null);
  revalidatePath(`/${locale}/app/projects/${projectId}/executions`);
  return {ok: true, versionId, executionId: result.data.executionId, calculation: "requested"};
}
