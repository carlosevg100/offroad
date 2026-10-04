/** Prospective full-plan consumer. SQL commands own every task, source and
 * physical projection; this orchestration has no legacy writer or repair path. */
import {legacyGatewayFingerprint, type ModelGatewayConfig} from "@offroad/model-gateway";
import type {ResearchSource} from "@offroad/public-research";
import {capitalPlanningContextSchema, assertExactTaskPlan, planningPreludeTaskArtifact, planningTaskArtifact, type CapitalPlanningContext} from "./capital-planning";
import {createCapitalS11Processing,type CapitalS11RecipeReceipt} from "./capital-s11-processing";
import {transformCapitalS11FinalProduct} from "./capital-s11-final";
import type {CapitalS11Component} from "./capital-s11-recipe";
import type {CapitalS11QueueAdapter, CapitalS11DeliveredSource} from "./capital-s11-queue-adapter";
import type {ProviderConnections} from "./provider-processing";
import type {CapitalProjectAnalysisJob, QueueClient} from "./queue";

export type CapitalS11Research = {
  status:"succeeded"|"partial"|"abstained"; sources:ResearchSource[];
  costExposureUsd:number; jurisdiction:"BR"|"US";
  jurisdictionNeedsConfirmation:boolean; strategyFingerprint:string;
};
type Projection = Awaited<ReturnType<CapitalS11QueueAdapter["retainTaskProjection"]>>;
type Budget = {maxCostUsd:number;maxCalls:number;researchReserveUsd:number};
const preludeIds = ["M01","M02","M03"] as const;
const component=(slot:CapitalS11Component["slot"],id:string,version:number,body:unknown):CapitalS11Component=>({slot,id,version,body,bodyFingerprint:legacyGatewayFingerprint(body)});
export function capitalS11TaskStartInput(context:CapitalPlanningContext,recipeId:string,taskId:string,projections:ReadonlyMap<string,Pick<Projection,"artifactFingerprint">>){
 const task=context.tasks.find(value=>value.id===taskId);
 if(!task||task.dependencies.some(id=>!projections.has(id)))throw new Error("capital_s11_task_predecessor_missing");
 return{taskId,executorKey:"offroad.capital_planning",executorVersion:"2026.09.24-v2",
  inputFingerprint:legacyGatewayFingerprint({schemaVersion:"capital-s11-task-input.v1",taskId,recipeId,planFingerprint:context.plan.fingerprint,briefFingerprint:context.brief.content_fingerprint,dependencies:task.dependencies.map(id=>projections.get(id)!.artifactFingerprint)}),
  contextManifest:{schemaVersion:"capital-context-manifest.v1",projectId:context.project.id,planId:context.plan.id,briefId:context.brief.id}};
}
export function capitalS11NativeTaskArtifact(taskId:string,input:Parameters<typeof planningTaskArtifact>[1],budget:Pick<CapitalS11RecipeReceipt["operationalBudget"],"maxDispatches"|"researchReservationMicroUsd">){
 const artifact=planningTaskArtifact(taskId,input);
 if(taskId==="C02"||taskId==="S06"){const{failures:_failures,...content}=artifact.content;artifact.content={...content,failureDiagnostics:"not_retained"};}
 if(taskId==="M06"){const{externalSearchQueries:_queries,...content}=artifact.content;artifact.content={...content,modelCalls:[{taskId:"M04",maximum:budget.maxDispatches}],externalSearchReservationMicroUsd:budget.researchReservationMicroUsd};}
 return artifact;
}

/** One assembler for normal execution and later physical recovery. Bodies are
 * ephemeral. Source identities remain distinct from server delivery identities. */
export function assembleCapitalS11Components(input:{jobId:string;recipeId:string;context:CapitalPlanningContext;company:{name:string;website:string|null};research:CapitalS11Research;delivered:readonly CapitalS11DeliveredSource[];prelude:readonly Projection[]}){
  const predecessors=input.context.tasks.find(task=>task.id==="M04")?.dependencies;
  if(!predecessors||predecessors.join(",")!=="M01,M02"||input.prelude.length!==predecessors.length
    ||input.prelude.some((value,i)=>value.recipeId!==input.recipeId||value.taskId!==predecessors[i]))throw new Error("capital_s11_prelude_identity_denied");
  return assembleComponentBodies({...input,dependencies:input.prelude.map(value=>({id:value.capitalArtifactId,version:value.artifactVersion,artifactFingerprint:value.artifactFingerprint}))});
}
/** Four original physical predecessors are supplied by the closed human-return
 * port. The server seal checks the same lineage; this DTO grants no authority. */
export function assembleCapitalS11RevisionComponents(input:{jobId:string;recipeId:string;predecessorRecipeId:string;context:CapitalPlanningContext;company:{name:string;website:string|null};research:CapitalS11Research;delivered:readonly CapitalS11DeliveredSource[];predecessors:readonly Projection[]}){
 const ids=["M01","M02","C11","S10"];
 if(!input.context.revision||input.predecessors.length!==4||input.predecessors.some((p,i)=>p.recipeId!==input.predecessorRecipeId||p.taskId!==ids[i])
 ||input.context.tasks.find(t=>t.id==="M04")?.dependencies.join(",")!=="M01,M02"
 ||input.context.tasks.find(t=>t.id==="S11")?.dependencies.join(",")!=="S10,C11"
 ||input.context.dependency_artifacts.map(d=>d.task_id).join(",")!=="C11,S10"
 ||input.context.dependency_artifacts.some((d,i)=>d.id!==input.predecessors[i+2]!.capitalArtifactId||d.artifact_fingerprint!==input.predecessors[i+2]!.artifactFingerprint))throw new Error("capital_s11_revision_predecessor_identity_denied");
 return assembleComponentBodies({...input,dependencies:input.predecessors.map(p=>({id:p.capitalArtifactId,version:p.artifactVersion,artifactFingerprint:p.artifactFingerprint}))});
}
function assembleComponentBodies(input:{jobId:string;recipeId:string;context:CapitalPlanningContext;company:{name:string;website:string|null};research:CapitalS11Research;delivered:readonly {deliveryId:string;source:ResearchSource}[];dependencies:readonly{id:string;version:number;artifactFingerprint:string}[]}){
  const {context,research}=input;
  return [component("company",context.session.id,1,input.company),
    component("brief",context.brief.id,context.brief.version,context.brief.content),
    component("institution",context.plan.id,context.plan.version,context.institution_capabilities??null),
    component("revision",input.jobId,1,context.revision?{correctionNote:context.revision.correction_note,priorContent:context.revision.prior_content}:null),
    component("research",input.recipeId,1,{status:research.status,jurisdiction:research.jurisdiction,jurisdictionNeedsConfirmation:research.jurisdictionNeedsConfirmation,strategyFingerprint:research.strategyFingerprint,sourceIds:input.delivered.map(value=>value.deliveryId)}),
    ...input.delivered.map(value=>component("source",value.deliveryId,1,value.source)),
    ...input.dependencies.map(value=>component("dependency",value.id,value.version,{artifactFingerprint:value.artifactFingerprint}))];
}

/** Server-authorized recovery supplies original finite bodies and fixed refs.
 * A missing retained source/context cannot be rebuilt from today's loaders. */
export function reconstructCapitalS11Components(input:{recipe:CapitalS11RecipeReceipt;originalContext:unknown;sources:readonly{deliveryId:string;source:ResearchSource}[];
 metadata:{researchStatus:"succeeded"|"partial"|"abstained";jurisdiction:"BR"|"US";jurisdictionNeedsConfirmation:boolean;strategyFingerprint:string;dependencies:readonly{id:string;artifactFingerprint:string}[]}}){
 const context=capitalPlanningContextSchema.parse(input.originalContext),name=context.session.company_profile.name,website=context.session.company_profile.website;
 if(typeof name!=="string"||!name.trim()||context.project.id!==input.recipe.workId||context.project.organization_id!==input.recipe.organizationId||context.plan.id!==input.recipe.planId||context.plan.fingerprint!==input.recipe.planFingerprint||context.session.locale!==input.recipe.locale)throw new Error("capital_s11_recovery_context_changed");
 const refs=input.recipe.components.filter(value=>value.slot==="dependency");
 if(refs.length!==(context.revision?4:2)||input.metadata.dependencies.length!==refs.length)throw new Error("capital_s11_recovery_dependencies_changed");
 if(context.revision&&(context.dependency_artifacts.map(d=>d.task_id).join(",")!=="C11,S10"||context.dependency_artifacts.some((d,i)=>d.id!==refs[i+2]!.id||legacyGatewayFingerprint({artifactFingerprint:d.artifact_fingerprint})!==refs[i+2]!.bodyFingerprint)))throw new Error("capital_s11_recovery_revision_dependencies_changed");
 const dependencies=refs.map((ref,i)=>{const observed=input.metadata.dependencies[i];if(!observed||observed.id!==ref.id||legacyGatewayFingerprint({artifactFingerprint:observed.artifactFingerprint})!==ref.bodyFingerprint)throw new Error("capital_s11_recovery_dependencies_changed");return{id:ref.id,version:ref.version,artifactFingerprint:observed.artifactFingerprint};});
 const components=assembleComponentBodies({jobId:input.recipe.jobId,recipeId:input.recipe.recipeId,context,company:{name:name.trim(),website:typeof website==="string"&&website.trim()?website.trim():null},
 research:{status:input.metadata.researchStatus,jurisdiction:input.metadata.jurisdiction,jurisdictionNeedsConfirmation:input.metadata.jurisdictionNeedsConfirmation,strategyFingerprint:input.metadata.strategyFingerprint,sources:input.sources.map(value=>value.source),costExposureUsd:0},delivered:input.sources,dependencies});
 if(legacyGatewayFingerprint(components.map(({body:_body,...ref})=>ref))!==legacyGatewayFingerprint(input.recipe.components))throw new Error("capital_s11_recovery_components_changed");
 return{context,components};
}

export async function consumeCapitalS11Initial(job:CapitalProjectAnalysisJob,input:{
  adapter:CapitalS11QueueAdapter; queue:Pick<QueueClient,"startCapitalTask">;
  research:(context:CapitalPlanningContext)=>Promise<CapitalS11Research>;
  adapters:ModelGatewayConfig["adapters"];connections:ProviderConnections;budget:Budget;
}){
  const base=await input.adapter.begin(),context=capitalPlanningContextSchema.parse(base.context);
  assertExactTaskPlan(job,context);
  // Human-return revision requires a separate, physically authorized lineage
  // command. An old JSON projection is never upgraded into a new authority.
  if(context.revision)throw new Error("capital_s11_native_revision_command_required");
  const name=context.session.company_profile.name,website=context.session.company_profile.website;
  if(typeof name!=="string"||!name.trim())throw new Error("capital_s11_company_identity_missing");
  const company={name:name.trim(),website:typeof website==="string"&&website.trim()?website.trim():null};
  const projections=new Map<string,Projection>();
  const start=(taskId:string)=>input.queue.startCapitalTask(job,capitalS11TaskStartInput(context,base.recipeId,taskId,projections));
  const project=async(taskId:string,taskRunId:string,artifact:{type:string;content:Record<string,unknown>})=>{
    const body={schemaVersion:"capital-planning-task.v1",taskId,artifactType:artifact.type,content:artifact.content};
    const receipt=await input.adapter.retainTaskProjection({taskId,taskRunId,body,semanticFingerprint:legacyGatewayFingerprint(body)});
    projections.set(taskId,receipt);return receipt;
  };
  for(const taskId of preludeIds)await project(taskId,await start(taskId),planningPreludeTaskArtifact(taskId,{context,companyName:company.name,website:company.website}));
  const research=await input.research(context);
  if(!Number.isFinite(research.costExposureUsd)||research.costExposureUsd<0||research.costExposureUsd>input.budget.researchReserveUsd)throw new Error("capital_s11_research_budget_denied");
  const delivered=await input.adapter.captureSources(research.sources);
  const actualResearch={...research,sources:delivered.map(value=>value.source)};
  const components=assembleCapitalS11Components({jobId:job.job_id,recipeId:base.recipeId,context,company,research:actualResearch,delivered,prelude:[projections.get("M01")!,projections.get("M02")!]});
  const seal=await input.adapter.seal({components,budget:input.budget});
  const result=await createCapitalS11Processing({jobId:job.job_id,ports:input.adapter.ports,adapters:input.adapters,connections:input.connections,
    budget:{maxCostUsd:Math.max(0,input.budget.maxCostUsd-input.budget.researchReserveUsd),maxCalls:input.budget.maxCalls}}).run(seal.producerTaskRunId);
  if(!("acceptedInvocation" in result))throw new Error("capital_s11_native_recovery_command_required");
  const transformed=transformCapitalS11FinalProduct({parsed:result.output,company,locale:context.session.locale,asOfDate:base.asOfDate,
    sources:actualResearch.sources,researchStatus:research.status,accepted:{provider:result.acceptedInvocation.provider,reportedModel:result.acceptedInvocation.reportedModel}});
  return input.adapter.commitFinal({body:transformed.finalProduct,quality:transformed.qualityResults,deriveTasks:async()=>{
    for(const task of context.tasks){
      if(preludeIds.some(id=>id===task.id)||task.id==="S11")continue;
      const artifact=capitalS11NativeTaskArtifact(task.id,{context,planningMap:result.output,companyName:company.name,website:company.website,
        research:{status:research.status,recipeId:base.recipeId,costExposureUsd:research.costExposureUsd,sources:actualResearch.sources,failures:[]}},seal.operationalBudget);
      // The real paid producer is M04; the historical S11 execution-plan
      // projection must not describe a second paid task that never ran.
      await project(task.id,task.id==="M04"?seal.producerTaskRunId:await start(task.id),artifact);
    }
  }});
}

/** Called only after the joint human-return guard/physical port deployment.
 * No research callback exists: this correction recaptures current licensed
 * original sources and publishes only a new M04 plus the actual final S11. */
export async function consumeCapitalS11Revision(job:CapitalProjectAnalysisJob,input:{adapter:CapitalS11QueueAdapter;adapters:ModelGatewayConfig["adapters"];connections:ProviderConnections;budget:Budget}){
 if(!job.payload.revision_of_artifact_id||!job.payload.correction_decision_id||!job.payload.revision_review_id||!job.payload.revision_of_native_revision_id)throw new Error("capital_s11_human_revision_required");
 const base=await input.adapter.begin(),context=capitalPlanningContextSchema.parse(base.context),physical=base.revisionInput;
 if(job.payload.analysis_scope!=="capital_planning"||job.payload.capital_task_ids.join(",")!=="M04,S11"||context.project.id!==job.payload.capital_project_id||context.plan.id!==job.payload.capital_project_plan_id||context.brief.id!==job.payload.capital_project_brief_id||context.tasks.length!==35)throw new Error("capital_s11_revision_plan_scope_invalid");
 if(!context.revision||context.revision.of_artifact_id!==job.payload.revision_of_artifact_id||context.revision.decision_id!==job.payload.correction_decision_id||!physical||physical.grant.jobId!==job.job_id||physical.grant.reviewId!==job.payload.revision_review_id||physical.grant.decisionId!==job.payload.correction_decision_id||physical.grant.priorRevisionId!==job.payload.revision_of_native_revision_id||legacyGatewayFingerprint(context.revision.prior_content)!==legacyGatewayFingerprint(physical.priorBody))throw new Error("capital_s11_revision_physical_input_required");
 const name=context.session.company_profile.name,website=context.session.company_profile.website;
 if(typeof name!=="string"||!name.trim())throw new Error("capital_s11_company_identity_missing");
 const company={name:name.trim(),website:typeof website==="string"&&website.trim()?website.trim():null};
 const delivered=await input.adapter.captureSources(physical.sources);
 const research:CapitalS11Research={status:physical.grant.researchStatus,sources:delivered.map(value=>value.source),costExposureUsd:0,jurisdiction:physical.grant.jurisdiction,jurisdictionNeedsConfirmation:physical.grant.jurisdictionNeedsConfirmation,strategyFingerprint:physical.grant.strategyFingerprint};
 const budget={maxCostUsd:Math.min(.8,input.budget.maxCostUsd),maxCalls:Math.min(1,input.budget.maxCalls),researchReserveUsd:0};
 const components=assembleCapitalS11RevisionComponents({jobId:job.job_id,recipeId:base.recipeId,predecessorRecipeId:physical.grant.predecessorRecipeId,context,company,research,delivered,predecessors:physical.predecessors.map(value=>value.projection)});
 const seal=await input.adapter.seal({components,budget});
 const result=await createCapitalS11Processing({jobId:job.job_id,ports:input.adapter.ports,adapters:input.adapters,connections:input.connections,budget:{maxCostUsd:budget.maxCostUsd,maxCalls:budget.maxCalls}}).run(seal.producerTaskRunId);
 if(!("acceptedInvocation" in result))throw new Error("capital_s11_native_recovery_command_required");
 const transformed=transformCapitalS11FinalProduct({parsed:result.output,company,locale:context.session.locale,asOfDate:base.asOfDate,sources:research.sources,researchStatus:research.status,accepted:{provider:result.acceptedInvocation.provider,reportedModel:result.acceptedInvocation.reportedModel}});
 return input.adapter.commitFinal({body:transformed.finalProduct,quality:transformed.qualityResults,deriveTasks:async()=>{
  const artifact=capitalS11NativeTaskArtifact("M04",{context,planningMap:result.output,companyName:company.name,website:company.website,research:{...research,recipeId:base.recipeId,failures:[]}},seal.operationalBudget);
  const body={schemaVersion:"capital-planning-task.v1",taskId:"M04",artifactType:artifact.type,content:artifact.content};
  await input.adapter.retainTaskProjection({taskId:"M04",taskRunId:seal.producerTaskRunId,body,semanticFingerprint:legacyGatewayFingerprint(body)});
 }});
}
