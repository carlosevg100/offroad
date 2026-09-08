import {z} from "zod";
import {capitalProjectPlanSnapshot, compileCapitalExecutionBrief, offroadTaskEffectSchema, visibleExecutionBrief, type CapitalProjectPlanSnapshot, type ExecutionBriefSource} from "@offroad/work-plan";
import type {ExecutionBriefProposalJob, QueueClient} from "./queue";
import {describeJobFailure} from "./job-failure";
import {buildGovernedSectorPlanning, governedSectorContextInputsSchema} from "./governed-sector-planning";

const deliverables = {
  preview_meeting_brief: {"pt-BR": "Devolutiva da análise em validação, com evidências e lacunas", "en-US": "Readout of the analysis under validation, with evidence and gaps"},
  company_debt_diagnostic: {"pt-BR": "Diagnóstico da dívida e da capacidade financeira, com evidências e lacunas", "en-US": "Debt and financial capacity diagnostic, with evidence and gaps"},
  meeting_brief: {"pt-BR": "Preparação da reunião, com achados, hipóteses e perguntas", "en-US": "Meeting preparation with findings, hypotheses and questions"},
  alternative_map: {"pt-BR": "Mapa de alternativas de capital, premissas e consequências", "en-US": "Capital alternatives map, assumptions and consequences"},
  diagnostic_recommendation: {"pt-BR": "Diagnóstico do caso e próximos caminhos fundamentados", "en-US": "Case diagnostic and evidence-backed next paths"},
  operation_review: {"pt-BR": "Revisão da operação, termos, riscos e pontos a esclarecer", "en-US": "Transaction review, terms, risks and points to clarify"},
  production_plan: {"pt-BR": "Plano de produção dos materiais e dependências", "en-US": "Materials production plan and dependencies"},
} as const;
const proposalContextSchema = z.object({
  governed_sector_context_inputs: governedSectorContextInputsSchema.optional(),
  target_job_id: z.uuid(),
  target_kind: z.enum(["case_analysis", "capital_project_analysis"]),
  input_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  project: z.object({entry_job: z.enum(["company_debt_view", "origination_thesis", "capital_planning", "structure_from_documents", "review_existing_operation", "prepare_materials_and_process"]), id: z.uuid(), name: z.string().min(1), company_name: z.string().min(1).nullish(), access_basis: z.enum(["public_information", "authorized_private"])}),
  objective: z.string().min(1),
  locale: z.enum(["pt-BR", "en-US"]),
  documents: z.array(z.object({id: z.uuid(), name: z.string().min(1)})),
  plan: z.object({
    schemaVersion: z.literal("capital-project-plan.v1"), compilerVersion: z.string().min(3), registryVersion: z.string().min(3),
    job: z.object({firstWorkProduct: z.enum(["preview_meeting_brief", "company_debt_diagnostic", "meeting_brief", "alternative_map", "diagnostic_recommendation", "operation_review", "production_plan"]), id: z.enum(["company_debt_view", "origination_thesis", "capital_planning", "structure_from_documents", "review_existing_operation", "prepare_materials_and_process"])}).passthrough(),
    taskSpecs: z.array(z.object({id: z.string().regex(/^[A-Z][0-9]{2}$/), dependencies: z.array(z.string()), effect: offroadTaskEffectSchema}).passthrough()).min(1).max(80),
  }).passthrough().nullable(),
});

/** Deterministic planning only. The atomic recording RPC binds the held job; it never releases it. */
export async function processExecutionBriefProposalJob(job: ExecutionBriefProposalJob, queue: Pick<QueueClient, "loadExecutionBriefProposal" | "recordExecutionBriefProposal" | "fail">) {
  try {
    if (!queue.loadExecutionBriefProposal || !queue.recordExecutionBriefProposal) throw new Error("execution_brief_proposal_commands_unavailable");
    const context = proposalContextSchema.parse(await queue.loadExecutionBriefProposal(job));
    if (context.target_job_id !== job.payload.approval_target_job_id || context.locale !== job.payload.locale) throw new Error("execution_brief_proposal_context_mismatch");
    if (!context.plan && context.target_kind !== "case_analysis") throw new Error("execution_brief_proposal_plan_required");
    const bootstrappedPlan = context.plan ? null : capitalProjectPlanSnapshot(context.project.entry_job);
    const plan = context.plan ?? bootstrappedPlan!;
    const pt = context.locale === "pt-BR";
    const sources: ExecutionBriefSource[] = [
      {key: `project:${context.project.id}`, label: pt ? "Pedido e contexto deste projeto" : "Request and context of this project", role: "project_context", status: "available", informationClass: "private", authorized: true},
      ...context.documents.map((document): ExecutionBriefSource => ({key: document.id, label: document.name, role: "provided_documents", status: "available", informationClass: "private", authorized: true})),
    ];
    if (context.documents.length === 0) {
      sources.push({key: "required-documents", label: pt ? "Documentos necessários ao caso ainda não disponíveis" : "Required case documents not yet available", role: "provided_documents", status: "to_request", informationClass: "private", authorized: true});
    }
    if (context.project.access_basis === "public_information") {
      sources.push({key: "public-company", label: pt ? "Divulgações públicas da companhia a pesquisar" : "Company public disclosures to research", role: "public_company", status: "to_research", informationClass: "public", authorized: true});
    }
    if (plan.taskSpecs.some((task) => task.id.startsWith("K"))) {
      sources.push({key: "public-market", label: pt ? "Referências públicas de mercado a pesquisar" : "Public market references to research", role: "public_market", status: "to_research", informationClass: "public", authorized: true});
    }
    const internal = compileCapitalExecutionBrief({
      planningContext: buildGovernedSectorPlanning({inputs: context.governed_sector_context_inputs, sessionId: job.intake_session_id, companyLabel: context.project.company_name ?? context.project.name, locale: context.locale, objective: context.objective}),
      plan: plan as unknown as CapitalProjectPlanSnapshot,
      revisionContext: context.target_job_id,
      locale: context.locale, objective: context.objective, companyLabel: context.project.company_name ?? context.project.name,
      audienceLabel: pt ? "responsável pela decisão" : "decision owner",
      proposedDeliverable: deliverables[plan.job.firstWorkProduct as keyof typeof deliverables][context.locale],
      sources, authority: {evidenceRegime: context.project.access_basis === "authorized_private" ? "private" : context.documents.length ? "mixed" : "public", executionAuthority: "analysis_only", establishedBy: "system_policy"},
      expensiveWork: true,
    });
    await queue.recordExecutionBriefProposal(job, internal, visibleExecutionBrief(internal), context.input_fingerprint, bootstrappedPlan);
    return {status: "proposed" as const};
  } catch (error) {
    const failure = describeJobFailure(error, {code: "execution_brief_proposal_failed", stage: "execution_brief_proposal"});
    const retryable = failure.retryable && job.attempt < 3;
    await queue.fail(job, {...failure, retryable}, {retryable});
    return {status: "failed" as const};
  }
}
