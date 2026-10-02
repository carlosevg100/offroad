/** Real 24-task DAG: M06 is the physical execution plan; paid invocation and C11 are distinct. */
import {legacyGatewayFingerprint,type ModelGatewayConfig} from '@offroad/model-gateway';
import type {ResearchSource} from '@offroad/public-research';
import {companyDebtContextSchema,assertExactCompanyDebtTaskPlan,validateCompanyDebtDiagnostic,type CompanyDebtContext} from './company-debt-view';
import {capitalCompanyDebtPreludeIds,capitalCompanyDebtDerivedIds,capitalCompanyDebtPreludeProduct,capitalCompanyDebtDerivedProduct} from './capital-company-debt-task-products';
import {capitalCompanyDebtArtifactSchema,transformCapitalCompanyDebtFinalProduct} from './capital-company-debt-final';
import {createCapitalCompanyDebtProcessing,type CapitalCompanyDebtRecipeReceipt} from './capital-company-debt-processing';
import type {CapitalCompanyDebtComponent} from './capital-company-debt-recipe';
import type {CapitalCompanyDebtQueueAdapter,CapitalCompanyDebtDeliveredSource} from './capital-company-debt-queue-adapter';
import type {CapitalProjectAnalysisJob,QueueClient} from './queue';
import type {ProviderConnections} from './provider-processing';
type Projection=Awaited<ReturnType<CapitalCompanyDebtQueueAdapter['retainTaskProjection']>>;
export type CapitalCompanyDebtResearch={status:'succeeded'|'partial';researchRunId:string;sources:ResearchSource[];costExposureUsd:number};
const component=(slot:CapitalCompanyDebtComponent['slot'],id:string,version:number,body:unknown):CapitalCompanyDebtComponent=>({slot,id,version,body,bodyFingerprint:legacyGatewayFingerprint(body)});
export function assembleCapitalCompanyDebtComponents(input:{jobId:string;recipeId:string;context:CompanyDebtContext;company:{name:string;website:string|null};research:CapitalCompanyDebtResearch;delivered:readonly Pick<CapitalCompanyDebtDeliveredSource,'deliveryId'|'source'>[];executionPlan:Pick<Projection,'recipeId'|'taskId'|'taskRunId'|'capitalArtifactId'|'artifactFingerprint'|'artifactVersion'>}){
 const {context,executionPlan:plan}=input;
 if(plan.recipeId!==input.recipeId||plan.taskId!=='M06'||context.tasks.find(t=>t.id==='M06')?.dependencies.join(',')!=='M04,M05')throw new Error('capital_debt_execution_plan_identity_denied');
 return [component('company',context.session.id,1,input.company),component('brief',context.brief.id,context.brief.version,context.brief.content),component('institution',context.plan.id,context.plan.version,context.institution_capabilities??null),component('revision',input.jobId,1,context.revision?{correctionNote:context.revision.correction_note,priorContent:context.revision.prior_content}:null),component('research',input.recipeId,1,{status:input.research.status,sourceIds:input.delivered.map(s=>s.deliveryId)}),...input.delivered.map(s=>component('source',s.deliveryId,1,s.source)),component('execution_plan',plan.capitalArtifactId,plan.artifactVersion,{taskId:'M06',taskRunId:plan.taskRunId,capitalArtifactId:plan.capitalArtifactId,artifactFingerprint:plan.artifactFingerprint})];
}
export function capitalCompanyDebtTaskStartInput(context:CompanyDebtContext,recipeId:string,taskId:string,projections:ReadonlyMap<string,Projection>){
 const task=context.tasks.find(t=>t.id===taskId);if(!task||task.dependencies.some(dep=>!projections.has(dep)))throw new Error('capital_debt_task_dependencies_incomplete');
 return {taskId,executorKey:'offroad.company_debt_view',executorVersion:'2026.09.01-v1',inputFingerprint:legacyGatewayFingerprint({taskId,recipeId,planFingerprint:context.plan.fingerprint,briefFingerprint:context.brief.content_fingerprint,dependencies:task.dependencies.map(dep=>({taskId:dep,artifactFingerprint:projections.get(dep)!.artifactFingerprint}))}),contextManifest:{schemaVersion:'capital-context-manifest.v1',projectId:context.project.id,planId:context.plan.id,briefId:context.brief.id}};
}
export async function consumeCapitalCompanyDebtInitial(job:CapitalProjectAnalysisJob,input:{adapter:CapitalCompanyDebtQueueAdapter;queue:Pick<QueueClient,'startCapitalTask'>;research:(context:CompanyDebtContext)=>Promise<CapitalCompanyDebtResearch>;adapters:ModelGatewayConfig['adapters'];connections:ProviderConnections;budget:{maxCostUsd:number;maxCalls:number;researchReserveUsd:number}}){
 const base=await input.adapter.begin(),context=companyDebtContextSchema.parse(base.context);assertExactCompanyDebtTaskPlan(job,context);
 if(Boolean(context.revision)!==Boolean(base.revisionInput))throw new Error('capital_debt_native_revision_physical_input_required');
 const name=context.session.company_profile.name,website=context.session.company_profile.website;
 if(typeof name!=='string'||!name.trim())throw new Error('capital_debt_company_identity_missing');
 const company={name:name.trim(),website:typeof website==='string'&&website.trim()?website.trim():null};
 const maxDispatches=Math.min(2,input.budget.maxCalls,job.payload.model_budget.max_calls);
 const projections=new Map<string,Projection>();
 const project=async(taskId:string,artifact:{type:string;content:Record<string,unknown>})=>{const taskRunId=await input.queue.startCapitalTask(job,capitalCompanyDebtTaskStartInput(context,base.recipeId,taskId,projections));const body={schemaVersion:'company-debt-task.v1',taskId,artifactType:artifact.type,content:artifact.content};const ref=await input.adapter.retainTaskProjection({taskId,taskRunId,body,semanticFingerprint:legacyGatewayFingerprint(body)});projections.set(taskId,ref);return ref;};
 if(!base.revisionInput)for(const taskId of capitalCompanyDebtPreludeIds)await project(taskId,capitalCompanyDebtPreludeProduct(taskId,{context,company,maxDispatches}));
 const research:CapitalCompanyDebtResearch=base.revisionInput?{status:base.revisionInput.grant.researchStatus,researchRunId:base.recipeId,sources:base.revisionInput.sources,costExposureUsd:0}:await input.research(context);
 if(!Number.isFinite(research.costExposureUsd)||research.costExposureUsd<0||research.costExposureUsd>input.budget.researchReserveUsd)throw new Error('capital_debt_research_budget_denied');
 const delivered=await input.adapter.captureSources(research.sources),actualResearch={...research,sources:delivered.map(s=>s.source)};
 const components=assembleCapitalCompanyDebtComponents({jobId:job.job_id,recipeId:base.recipeId,context,company,research:actualResearch,delivered,executionPlan:base.revisionInput?{...base.revisionInput.predecessors.find(ref=>ref.projection.taskId==='M06')!.projection,recipeId:base.recipeId}:projections.get('M06')!});
 const seal=await input.adapter.seal({components,budget:input.budget});
 const paid=await createCapitalCompanyDebtProcessing({jobId:job.job_id,ports:input.adapter.ports,adapters:input.adapters,connections:input.connections,budget:{maxCostUsd:Math.max(0,input.budget.maxCostUsd-input.budget.researchReserveUsd),maxCalls:input.budget.maxCalls}}).run(seal.executionPlanTaskRunId);
 if(paid.recovered)throw new Error('capital_debt_initial_requires_native_recovery_adapter');
 const quality=validateCompanyDebtDiagnostic(paid.output,new Set(actualResearch.sources.map(s=>s.url)),actualResearch.sources);
 const final=transformCapitalCompanyDebtFinalProduct({parsed:paid.output,company,locale:context.session.locale,asOfDate:base.asOfDate,sources:actualResearch.sources,researchStatus:actualResearch.status,accepted:{provider:paid.acceptedInvocation.provider as 'anthropic'|'openai',reportedModel:paid.acceptedInvocation.reportedModel as 'claude-sonnet-5'|'gpt-5.6-terra'}});
 const committed=await input.adapter.commitFinal({body:final,quality,deriveTasks:async()=>{if(base.revisionInput)return;for(const taskId of capitalCompanyDebtDerivedIds)await project(taskId,capitalCompanyDebtDerivedProduct(taskId,{company,diagnostic:paid.output,research:actualResearch}));}});
 if(committed.executionPlanTaskRunId!==seal.executionPlanTaskRunId||committed.taskRunId===seal.executionPlanTaskRunId||(!base.revisionInput&&projections.size!==23)||Boolean(base.revisionInput)&&projections.size!==0)throw new Error('capital_debt_task_chain_incomplete');
 return {committed,recipe:seal,product:final,spend:paid.spend,usage:paid.usage};
}
export type CapitalCompanyDebtNativeRecipe=CapitalCompanyDebtRecipeReceipt;

/** Recovery reconstructs exclusively from retained context/sources and server pins. */
export function reconstructCapitalCompanyDebtComponents(input:{recipe:CapitalCompanyDebtRecipeReceipt;originalContext:unknown;sources:readonly{deliveryId:string;source:ResearchSource}[];metadata:{researchStatus:'succeeded'|'partial';dependencies:readonly{id:string;artifactFingerprint:string}[]}}){
 const context=companyDebtContextSchema.parse(input.originalContext);if(context.revision)capitalCompanyDebtArtifactSchema.parse(context.revision.prior_content);const name=context.session.company_profile.name,website=context.session.company_profile.website;
 if(typeof name!=='string'||!name.trim()||context.project.id!==input.recipe.workId||context.project.organization_id!==input.recipe.organizationId||context.plan.id!==input.recipe.planId||context.plan.fingerprint!==input.recipe.planFingerprint||context.session.locale!==input.recipe.locale)throw new Error('capital_debt_recovery_context_changed');
 const refs=input.recipe.components.filter(v=>v.slot==='execution_plan'),observed=input.metadata.dependencies[0];
 if(refs.length!==1||input.metadata.dependencies.length!==1||!observed||refs[0]!.id!==observed.id)throw new Error('capital_debt_recovery_execution_plan_changed');
 const executionPlan={recipeId:input.recipe.recipeId,taskId:'M06',taskRunId:input.recipe.executionPlanTaskRunId,capitalArtifactId:observed.id,artifactFingerprint:observed.artifactFingerprint,artifactVersion:refs[0]!.version};
 const components=assembleCapitalCompanyDebtComponents({jobId:input.recipe.jobId,recipeId:input.recipe.recipeId,context,company:{name:name.trim(),website:typeof website==='string'&&website.trim()?website.trim():null},research:{status:input.metadata.researchStatus,researchRunId:input.recipe.recipeId,sources:input.sources.map(v=>v.source),costExposureUsd:0},delivered:input.sources,executionPlan});
 if(legacyGatewayFingerprint(components.map(({body:_body,...ref})=>ref))!==legacyGatewayFingerprint(input.recipe.components))throw new Error('capital_debt_recovery_components_changed');
 return{context,components};
}
