import {capitalProjectPlanSnapshot, compileTaskGraph, type CapitalProjectJob, type CapitalProjectPlanSnapshot} from "./capital-jobs";
import {compileExecutionBrief, type ExecutionBriefLocale, type ExecutionBriefSource} from "./execution-brief";

export const documentWorkPlanPrefix = "document-work-plan.v1:";
export function documentWorkPlanSnapshot(entry:CapitalProjectJob):CapitalProjectPlanSnapshot {
  const base=capitalProjectPlanSnapshot(entry), graph=compileTaskGraph(["Q03"]);
  return {...base,job:{...base.job,targetTaskIds:["Q03"]},taskSpecs:graph.tasks.map((task,ordinal)=>({...task,ordinal,batch:ordinal})),parallelBatches:graph.parallelBatches};
}
/** A marker alone is never enough: every task in the persisted brief must be documentary. */
export function isDocumentWorkBrief(raw:unknown):boolean {
  if(!raw||typeof raw!=="object")return false;
  const value=raw as {planVersion?:unknown;workstreams?:unknown};
  if(typeof value.planVersion!=="string"||!value.planVersion.startsWith(documentWorkPlanPrefix)||!Array.isArray(value.workstreams)||value.workstreams.length!==3)return false;
  const ids=value.workstreams.flatMap((stream:unknown)=>{
    if(!stream||typeof stream!=="object")return [null];
    const keys=(stream as {sourceTaskIds?:unknown}).sourceTaskIds;
    return Array.isArray(keys)?keys:[null];
  });
  return ids.length===3&&[...ids].sort().join(",")==="Q01,Q02,Q03";
}
export function compileDocumentWorkBrief(input:{job:"comparison"|"meeting"|"review";plan:CapitalProjectPlanSnapshot;revisionContext:string;locale:ExecutionBriefLocale;objective:string;sources:readonly ExecutionBriefSource[]}) {
  const pt=input.locale==="pt-BR";
  if(input.plan.taskSpecs.map(task=>task.id).sort().join(",")!=="Q01,Q02,Q03")throw new Error("document_work_plan_scope_mismatch");
  const names=pt?["Conferir os documentos", "Preparar a leitura", "Entregar e revisar"]:["Check the documents","Prepare the reading","Deliver and review"];
  const purposes=pt?["Verificar versões e declarar o que foi possível ler.","Responder ao pedido com observações das fontes, hipóteses e lacunas separadas.","Salvar a leitura preliminar e disponibilizar Word editável para revisão."]:["Verify versions and declare reading coverage.","Address the request with sourced observations, separate hypotheses and gaps.","Save the preliminary reading and provide editable Word for review."];
  return compileExecutionBrief({planVersion:`${documentWorkPlanPrefix}${input.job}:${input.plan.registryVersion}:${input.revisionContext}`,locale:input.locale,objective:input.objective,
    proposedDeliverable:pt?"Leitura documental preliminar, com hipóteses, lacunas e Word editável":"Preliminary documentary reading with hypotheses, gaps and editable Word",
    tasks:input.plan.taskSpecs,workstreams:names.map((label,index)=>({key:`documentary-${index+1}`,label,purpose:purposes[index]!,taskIds:[`Q0${index+1}`],sourceRoles:["provided_documents","project_context"],analyses:[purposes[index]!],output:purposes[index]!,inclusionReasons:["user_requested"]})),
    sources:input.sources,assumptions:[{label:pt?"Escopo":"Scope",value:pt?"Escopo documental qualitativo; não inclui cálculos financeiros, recomendação de crédito ou envio ao mercado.":"Qualitative documentary scope; excludes financial calculations, credit recommendations and market distribution.",basis:pt?"Pedido e plano sujeito a aprovação":"Request and plan subject to approval",editable:true}],
    checkpoints:[{label:pt?"Revisar a leitura e responder às lacunas":"Review the reading and address gaps",afterWorkstreamKey:"documentary-3",kind:"choice"}],
    authority:{evidenceRegime:"private",executionAuthority:"analysis_only",establishedBy:"system_policy"},expensiveWork:true});
}
