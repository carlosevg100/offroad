import {publicCapitalCatalogReference} from "@offroad/public-research/capital-catalog";
import {isDeepStrictEqual} from "node:util";
import {capitalProjectPlanSnapshot, compileTaskGraph, type CapitalProjectPlanSnapshot, type CapitalProjectJob} from "./capital-jobs";
import {compileExecutionBrief, type ExecutionBriefLocale} from "./execution-brief";

/** Deliberately narrow: an explicit research request, not an introduction or a company analysis. */
export function isProviderResearchRequest(message: string): boolean {
  return /\b(pesquis\w*|mapear|mapeie|listar|liste|research|map|list)\b/i.test(message)
    && /\b(financiadores|investidores|fundos|mandatos|lenders|investors|funds|mandates|capital providers)\b/i.test(message)
    && !/\b(contat\w*|contact\w*|introdu\w*|envie|enviar|send|dispar\w*|shortlist|calcule|calcular|calculate|valuation|prepare|preparar|monte|modelar|underwrite)\b/i.test(message);
}
export function providerResearchPlanSnapshotV1(): CapitalProjectPlanSnapshot {
  const base = capitalProjectPlanSnapshot("company_debt_view");
  const graph = compileTaskGraph(["K02"]);
  // Provider research keeps its independently persisted exact graph; documentary-only registry changes do not rewrite it.

  return {...base, registryVersion: "2026.09.10-v14", job: {...base.job, targetTaskIds: ["K02"], firstWorkProduct: "provider_research", inputPolicy: {company: "not_applicable", documents: "not_applicable", capitalIntent: "not_applicable", existingTransaction: "not_applicable", publicResearch: "not_applicable"}},
    taskSpecs: graph.tasks.map((task, ordinal) => ({...task, ordinal, batch: ordinal})), parallelBatches: graph.parallelBatches};
}
export function providerResearchPlanSnapshot(): CapitalProjectPlanSnapshot {
  const base = providerResearchPlanSnapshotV1();
  return {...base, registryVersion: "2026.09.10-public-research-v2", job: {...base.job, inputPolicy: {...base.job.inputPolicy, publicResearch: "allowed"}}};
}

export function compileProviderResearchBrief(input: {plan: CapitalProjectPlanSnapshot; revisionContext: string; locale: ExecutionBriefLocale; objective: string}) {
  const publicResearch = isDeepStrictEqual(input.plan, providerResearchPlanSnapshot());
  if (!publicResearch && !isDeepStrictEqual(input.plan, providerResearchPlanSnapshotV1())) throw new Error("provider_research_plan_scope_mismatch");
  const pt = input.locale === "pt-BR";
  const labels = pt ? ["Delimitar a pesquisa", "Consultar os registros autorizados", "Organizar mandatos e lacunas"] : ["Define the research scope", "Read authorized records", "Organize mandates and gaps"];
  const descriptions = pt ? ["Confirmar o universo solicitado e a data de referência.", "Reunir somente os registros que sua organização pode consultar.", "Apresentar critérios declarados, datas e informações faltantes, sem confirmar interesse em uma operação."] : ["Confirm the requested universe and reference date.", "Gather only records your organization is authorized to read.", "Present reported criteria, dates and missing information without confirming appetite for a transaction."];
  if (publicResearch) descriptions[1] = pt ? "Reunir o catálogo público datado e os registros privados autorizados, mantendo suas origens separadas." : "Gather the dated public catalog and authorized private records, keeping their origins separate.";
  return compileExecutionBrief({planVersion: `provider-research-plan.${publicResearch ? "v2" : "v1"}:${input.plan.registryVersion}:${input.revisionContext}`, locale: input.locale, objective: input.objective,
    proposedDeliverable: pt ? "Pesquisa de financiadores e mandatos, com fontes e lacunas" : "Lender and mandate research with sources and gaps", tasks: input.plan.taskSpecs,
    workstreams: labels.map((label, index) => ({key: `research-${index}`, label, purpose: descriptions[index]!, taskIds: [["M01"], ["K01"], ["K02"]][index]!, sourceRoles: ["capital_network", "project_context", ...(publicResearch ? ["public_market" as const] : [])], analyses: [descriptions[index]!], output: descriptions[index]!, inclusionReasons: ["user_requested"]})),
    sources: [...(publicResearch ? [{key: `${publicCapitalCatalogReference.snapshotId}:${publicCapitalCatalogReference.sourceFingerprint}`, label: `${pt ? "Catálogo público de financiadores" : "Public capital provider catalog"} (${publicCapitalCatalogReference.asOf})`, role: "public_market" as const, status: "available" as const, informationClass: "public" as const, authorized: true}] : []), {key: "authorized-records", label: pt ? "Registros de mercado autorizados para esta organização" : "Market records authorized for this organization", role: "capital_network", status: "available", informationClass: "private", authorized: true}],
    assumptions: [], checkpoints: [], authority: {evidenceRegime: publicResearch ? "mixed" : "private", executionAuthority: "analysis_only", establishedBy: "system_policy"}, expensiveWork: true});
}

/** Case-specific research remains inside the same project and its original entry identity. */
export function providerCaseFitPlanSnapshot(entryJob: CapitalProjectJob = "company_debt_view"): CapitalProjectPlanSnapshot {
  const base = capitalProjectPlanSnapshot(entryJob);
  const graph = compileTaskGraph(["K02"]);
  return {...base, registryVersion: "2026.09.10-v14", job: {...base.job, targetTaskIds: ["K02"], firstWorkProduct: "provider_case_fit", inputPolicy: {company: "not_applicable", documents: "not_applicable", capitalIntent: "required", existingTransaction: "not_applicable", publicResearch: "not_applicable"}},
    taskSpecs: graph.tasks.map((task, ordinal) => ({...task, ordinal, batch: ordinal})), parallelBatches: graph.parallelBatches};
}
export function compileProviderCaseFitBrief(input: {plan: CapitalProjectPlanSnapshot; revisionContext: string; locale: ExecutionBriefLocale; objective: string}) {
  if (!isDeepStrictEqual(input.plan, providerCaseFitPlanSnapshot(input.plan.job.id))) throw new Error("provider_case_fit_plan_scope_mismatch");
  const pt = input.locale === "pt-BR";
  const descriptions = pt ? ["Confirmar critérios do caso e data-base informados pelo usuário.", "Consultar somente mandatos disponíveis à organização, preservando fontes, divergências e datas.", "Comparar critérios, separar incompatibilidades e lacunas, ordenar os nomes para revisão sem autorizar contatos."] : ["Confirm the user-provided transaction criteria and reference date.", "Read only mandates available to this organization, preserving sources, conflicts and dates.", "Compare criteria, distinguish mismatches and gaps, and order providers for review without authorizing contact."];
  return compileExecutionBrief({planVersion: `provider-case-fit-plan.v1:${input.plan.registryVersion}:${input.revisionContext}`, locale: input.locale, objective: input.objective,
    proposedDeliverable: pt ? "Lista de financiadores para revisão, com aderência ao caso e evidências" : "Lender list for review, with transaction fit and evidence", tasks: input.plan.taskSpecs,
    workstreams: descriptions.map((description,index)=>({key:`case-fit-${index}`,label:description,purpose:description,taskIds:[["M01"],["K01"],["K02"]][index]!,sourceRoles:["capital_network","project_context"],analyses:[description],output:description,inclusionReasons:["user_requested"]})),
    sources:[{key:"confirmed-case",label:pt?"Critérios confirmados do caso e mandatos autorizados":"Confirmed transaction criteria and authorized mandates",role:"capital_network",status:"available",informationClass:"private",authorized:true}],assumptions:[],checkpoints:[],authority:{evidenceRegime:"private",executionAuthority:"analysis_only",establishedBy:"system_policy"},expensiveWork:true});
}
