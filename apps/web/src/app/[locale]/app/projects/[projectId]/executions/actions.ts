"use server";

import {checkQuarterUpdatePins, type PriorResultPins} from "@/lib/execution/quarter-update-pins";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {composeCapitalExecutionRequest, composeMethodExecutionRequest, executionContractBasisSchema, quarterUpdateMethodId, type ExecutionContractBasis,
  type QuarterUpdatePriors} from "@offroad/execution-request";
import {requireWorkspace} from "@/lib/auth/workspace";
import {capitalDecisionPurpose} from "@/lib/advisor/adoption-basis-reader";
import {executionRequestFailure, type ExecutionRequestError} from "@/lib/execution/failure";
import {executionRequestTextMaxLength} from "@/lib/execution/request-limits";
import {normalizeCnpj} from "@/lib/identity/cnpj";
import {recordBasisEntity} from "../basis/actions";

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

/** What each method's confirmed premises are and what the confirmation asks the method to answer. */
const comparisonSituations = ["seasonal-working-capital", "structural-working-capital", "capex-infrastructure", "stable-business-high-conversion", "near-covenant"];
const debtTableSituations = ["refinancing", "near-covenant", "restructuring"];
const capacitySituations = ["capex-infrastructure", "structural-working-capital", "stable-business-high-conversion", "near-covenant"];
const projectionSituations = ["stable-business-high-conversion", "structural-working-capital", "capex-infrastructure"];
const receivablesFundingSituations = ["seasonal-working-capital", "structural-working-capital"];
const quarterUpdateSituations = ["near-covenant", "seasonal-working-capital"];
const premiseMethods: Record<string, {key: string; text: string; ask: (summary: Record<string, unknown>) => {question: string; objectives: string[]; situationIds: string[]} | null}> = {
  "analyze-investment-project": {key: "investment.premises",
    text: "Premissas de um investimento confirmadas pela pessoa na conversa: documento, informado ou premissa da casa, conforme a origem de cada uma.",
    ask: () => ({question: "O investimento se paga e deve seguir agora?", objectives: ["Medir valor, retorno, payback e caixa consumido pelo investimento e o que muda a conclusão"], situationIds: ["capex-infrastructure"]})},
  "compare-financing-proposals": {key: "comparison.premises",
    text: "Termos de propostas para a mesma necessidade e premissas da companhia confirmados pela pessoa na conversa: documento, informado ou premissa da casa, conforme a origem de cada um.",
    ask: (summary) => typeof summary.situationId === "string" && comparisonSituations.includes(summary.situationId)
      ? {question: "Qual das propostas cabe na companhia e quanto custa de fato?",
        objectives: ["Comparar custo efetivo pela vida, caixa com a dívida existente, covenant na definição de cada credor, garantia e firmeza, e o que elimina antes da preferência"],
        situationIds: [summary.situationId]} : null},
  "assess-debt-capacity": {key: "capacity.premises",
    text: "Projeção, dívida vigente, cronogramas do uso, estrutura da dívida nova e limites confirmados pela pessoa na conversa: documento, informado ou premissa da casa, conforme a origem de cada um.",
    ask: (summary) => typeof summary.situationId === "string" && capacitySituations.includes(summary.situationId)
      ? {question: "Quanto de dívida nova cabe na companhia e com que perfil?",
        objectives: ["Medir o maior valor sob cada limite e o que prende, revisar o valor pedido nos casos adotados e conferir o plano vigente contra o caixa"],
        situationIds: [summary.situationId]} : null},
  "build-company-debt-table": {key: "debt-table.premises",
    text: "Operações, linhas de crédito, obrigações e definições de dívida confirmadas pela pessoa na conversa: documento, informado, premissa da casa ou estimativa, conforme a origem de cada uma.",
    ask: (summary) => typeof summary.situationId === "string" && debtTableSituations.includes(summary.situationId)
      ? {question: "Quanto a companhia deve, a quem e em cada definição?",
        objectives: ["Montar a tabela por operação com a fonte de cada termo, totais em cada definição com a ponte, cronograma, garantias, cross-default e o que falta para provar completude"],
        situationIds: [summary.situationId]} : null},
  "measure-covenant-headroom": {key: "covenant-headroom.premises",
    text: "Limites, definições, datas de apuração e medições confirmados pela pessoa na conversa: documento, informado, premissa da casa ou estimativa, conforme a origem de cada um.",
    ask: (summary) => summary.situationId === "near-covenant"
      ? {question: "Onde a companhia está contra os covenants e a política do conselho, e quanto pode piorar?",
        objectives: ["Medir cada covenant e a política pela definição escrita na data, com folga em EBITDA e em dívida, teste reverso, caso adverso, efeito sazonal e consequência"],
        situationIds: [summary.situationId]} : null},
  "project-weekly-cash": {key: "weekly-cash.premises",
    text: "Fluxos de caixa, obrigações, casos e ações confirmados pela pessoa na conversa: documento, informado, premissa da casa ou estimativa, conforme a origem de cada um.",
    ask: (summary) => summary.situationId === "seasonal-working-capital"
      ? {question: "Como fica o caixa semana a semana até a data e o que vence?",
        objectives: ["Achar a semana mais apertada e as abaixo do mínimo, o que vence nelas, o que o fechamento esconde e a ação mais barata que cobre, custeada pelo tempo de uso"],
        situationIds: [summary.situationId]} : null},
  "build-operating-projection": {key: "operating-projection.premises",
    text: "Drivers do último ano, drivers projetados, cenários e versões da companhia confirmados pela pessoa na conversa: documento, informado, premissa da casa ou estimativa, conforme a origem de cada um.",
    ask: (summary) => typeof summary.situationId === "string" && projectionSituations.includes(summary.situationId)
      ? {question: "Quanto caixa a companhia gera para servir a dívida e o que pode dar errado?",
        objectives: ["Reproduzir o último ano pelos drivers, projetar até o caixa disponível para a dívida, comparar com o orçamento sem sobrescrever, medir em reais as premissas que decidem e separar dado de hipótese"],
        situationIds: [summary.situationId]} : null},
  "challenge-financial-projection": {key: "projection-challenge.premises",
    text: "Plano da companhia, referência por drivers, premissas e réguas confirmados pela pessoa na conversa: documento, informado, premissa da casa ou estimativa, conforme a origem de cada um.",
    ask: (summary) => typeof summary.situationId === "string" && projectionSituations.includes(summary.situationId)
      ? {question: "Onde o plano vai ser questionado pelo banco e o que o sustentaria?",
        objectives: ["Medir o efeito isolado de cada premissa no EBITDA e no caixa contra a referência, confrontar com histórico, capacidade e contratos, dizer a evidência que sustentaria cada uma e como apresentar o plano"],
        situationIds: [summary.situationId]} : null},
  "monetize-receivables-for-working-capital": {key: "receivables-funding.premises",
    text: "Carteira por grupo de sacados, portas de financiamento, linha bancária e necessidade confirmados pela pessoa na conversa: documento, informado, faixa de mercado, premissa da casa ou estimativa, conforme a origem de cada um.",
    ask: (summary) => typeof summary.situationId === "string" && receivablesFundingSituations.includes(summary.situationId)
      ? {question: "Quanto da carteira vira caixa, com quem, a que custo e em quanto tempo, contra a linha do banco?",
        objectives: ["Separar a carteira cedível com o motivo de cada exclusão, ler cada porta com volume e custo pelo tempo de uso, comparar com a linha bancária e montar o plano com prazo e condições"],
        situationIds: [summary.situationId]} : null},
  [quarterUpdateMethodId]: {key: "quarter-update.premises",
    text: "Realizado do trimestre, causas de cada desvio, séries atualizadas, linhas aprovadas e análises dependentes confirmados pela pessoa na conversa: documento, informado, premissa da casa ou estimativa, conforme a origem de cada um.",
    ask: (summary) => typeof summary.situationId === "string" && quarterUpdateSituations.includes(summary.situationId)
      ? {question: "O que o fechamento do trimestre mudou e qual decisão ficou em risco?",
        objectives: ["Explicar cada desvio por causa, separar o pontual do que continua, atualizar o caixa semanal e o covenant sobre as versões anteriores preservadas, dizer qual decisão muda, a ação dentro do aprovado e o que não mudou"],
        situationIds: [summary.situationId]} : null},
};
type PremiseSuccess = {ok: true; versionId: string; executionId: string | null; calculation: "requested" | "pending_release"};
type PremiseFailure = {ok: false; error: ExecutionRequestError | "company_unregistered" | "superseded"; missing?: ("weeklyCash" | "covenant")[]};

const sourcePin = z.object({resourceId: z.uuid(), sourceVersionId: z.uuid(), contentHash: z.string().regex(/^[a-f0-9]{64}$/), rightsRevision: z.string().regex(/^[0-9]+$/)}).strict();
const priorSchema = z.object({executionId: z.uuid(), methodId: z.string(), methodVersion: z.string(), inputSnapshot: z.string().min(2), inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  resultFingerprint: z.string().regex(/^[a-f0-9]{64}$/), sources: z.array(sourcePin), committedAt: z.string()}).loose();
const priorsSchema = z.object({weeklyCash: priorSchema.nullable(), covenant: priorSchema.nullable()}).loose();

/** The person confirms the premises the conversation proposed. The company the dossier names as
 * its subject and the work's premise definition give every hypothesis its identity; the database
 * writes them all as this person in one transaction. Then the released investment method is asked
 * to calculate over exactly that basis version. Until the method is released and granted, the
 * premises stay confirmed and the calculation waits; nothing is invented to fill the gap. */
export async function confirmInvestmentPremises(input: unknown): Promise<PremiseSuccess | PremiseFailure> {
  return confirmPremiseProposal(input);
}

/** The same act for any method with premise proposals: the proposal names its method, which decides
 * the premise definition and what the released method is asked to answer over the confirmed basis. */
export async function confirmPremiseProposal(input: unknown): Promise<PremiseSuccess | PremiseFailure> {
  const parsed = route.extend({proposalId: z.uuid(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/), requestId: z.uuid(), definitionRequestId: z.uuid()}).strict().safeParse(input);
  if (!parsed.success) return failure({code: "22023"});
  const {locale, projectId, proposalId, fingerprint, requestId, definitionRequestId} = parsed.data;
  const {supabase, organization} = await requireWorkspace(locale);
  const proposal = await supabase.from("work_premise_proposals").select("id, capital_project_id, intake_session_id, status, fingerprint, method_id, summary, facts")
    .eq("organization_id", organization.id).eq("id", proposalId).eq("capital_project_id", projectId).maybeSingle();
  if (!proposal.data) return failure({code: "42501"});
  if (proposal.data.status === "superseded" || proposal.data.fingerprint !== fingerprint) return {ok: false, error: "superseded"};
  const method = premiseMethods[proposal.data.method_id];
  const summary = proposal.data.summary && typeof proposal.data.summary === "object" && !Array.isArray(proposal.data.summary) ? proposal.data.summary as Record<string, unknown> : {};
  const ask = method?.ask(summary) ?? null;
  if (!method || !ask) return failure({code: "22023"});
  const premiseDefinitionKey = method.key, premiseDefinitionText = method.text;
  // The quarter close updates the prior completed weekly cash and covenant results of this work; it is
  // refused before anything is written when one is missing, and superseded when the card named other versions.
  let priors: QuarterUpdatePriors | undefined;
  let pins: PriorResultPins | undefined;
  if (proposal.data.method_id === quarterUpdateMethodId) {
    const read = await supabase.rpc("quarter_update_prior_results_v1", {p_work_id: projectId});
    if (read.error) return failure(read.error);
    const found = priorsSchema.safeParse(read.data);
    if (!found.success) return failure(null);
    const missing = ([["weeklyCash", found.data.weeklyCash], ["covenant", found.data.covenant]] as const).filter(([, p]) => !p).map(([k]) => k);
    if (missing.length) return {ok: false, error: "priors_missing", missing};
    priors = {weeklyCash: found.data.weeklyCash!, covenant: found.data.covenant!};
    const facts = proposal.data.facts && typeof proposal.data.facts === "object" ? proposal.data.facts as Record<string, {value?: unknown} | undefined> : {};
    const pinned = checkQuarterUpdatePins(summary, facts, priors);
    if (!pinned.ok) return {ok: false, error: "superseded"};
    pins = pinned.pins;
  }
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
    ask: {...ask, asOf: now.slice(0, 10)},
    ids: {executionId: randomUUID(), requestId, processingRunId: randomUUID(), snapshotId: randomUUID()}, ...priors ? {priors} : {}});
  if (!composed.ok) return composed.error === "method_unavailable" ? {ok: true, versionId, executionId: null, calculation: "pending_release"}
    : composed.error === "provenance_denied" || composed.error === "composition_invalid" ? failure({code: "22023"}) : refused(composed.error);
  // Only the quarter close names prior results, through the v3 producer; every other method keeps v2.
  // The request names exactly the prior executions the card pinned.
  if (composed.priorResults && (!pins || composed.priorResults.length !== 2 || composed.priorResults.some((r, k) => r.role !== pins![k]!.role
    || r.executionId !== pins![k]!.executionId || r.resultFingerprint !== pins![k]!.resultFingerprint))) return {ok: false, error: "superseded"};
  const requested = composed.priorResults
    ? await supabase.rpc("request_work_execution_v3", {p_contract_text: composed.contractText, p_snapshot_text: composed.snapshotText, p_gates_text: composed.gatesText,
      p_prior_results: pins!})
    : await supabase.rpc("request_work_execution_v2", {p_contract_text: composed.contractText, p_snapshot_text: composed.snapshotText, p_gates_text: composed.gatesText});
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

/** The company a premise card calculates for, registered from the card itself when the work's dossier
 * names none yet: the person states the company's name and CNPJ once, the identity is reviewed under
 * that identifier and linked as the dossier's subject, exactly as the basis page does. Nothing is
 * inferred; a CNPJ that fails its check digits is refused before anything is written. */
export async function registerWorkCompany(input: unknown): Promise<{ok: true} | {ok: false; error: "invalid_cnpj" | "role_exists" | ExecutionRequestError}> {
  const parsed = route.extend({name: z.string().trim().min(2).max(300), cnpj: z.string().trim().min(14).max(24)}).strict().safeParse(input);
  if (!parsed.success) return failure({code: "22023"});
  const {locale, projectId, name} = parsed.data;
  const cnpj = normalizeCnpj(parsed.data.cnpj);
  if (!cnpj) return {ok: false, error: "invalid_cnpj"};
  const {supabase, organization} = await requireWorkspace(locale);
  const dossier = await supabase.from("dossiers").select("id").eq("organization_id", organization.id).eq("resource_id", projectId).maybeSingle();
  if (dossier.error || !dossier.data) return failure({code: "42501"});
  const recorded = await recordBasisEntity({locale, projectId, dossierId: dossier.data.id, name, namespace: "BR:CNPJ", value: cnpj,
    reason: "Companhia analisada informada no cartão de premissas da conversa, para calcular sobre as premissas confirmadas.", relationship: "subject", perimeter: "consolidated"});
  if (recorded.ok) return {ok: true};
  if (recorded.error === "roleExists") return {ok: false, error: "role_exists"};
  return failure({code: {invalid: "22023", denied: "42501", conflict: "40001", unavailable: undefined}[recorded.error]});
}
