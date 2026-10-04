/** Bodies for the real 24-task company-debt DAG. Ephemeral data, never CPA content. */
import type {z} from 'zod';
import {companyDebtDiagnosticSchema} from '@offroad/domain-contracts';
import type {ResearchSource} from '@offroad/public-research';
import type {CompanyDebtContext} from './company-debt-view';
export const capitalCompanyDebtPreludeIds=['M01','M02','M03','M04','M05','M06'] as const;
export const capitalCompanyDebtDerivedIds=['D01','D02','D03','D04','D05','D06','D07','C01','C02','C03','C04','C05','C06','C07','C08','C09','C10'] as const;
export function capitalCompanyDebtPreludeProduct(taskId:typeof capitalCompanyDebtPreludeIds[number],input:{context:CompanyDebtContext;company:{name:string;website:string|null};maxDispatches:number}){
 const {context,company}=input;
 const products={
 M01:{type:'company_resolution',content:{companyName:company.name,website:company.website,resolutionStatus:'user_identified_public_subject',accessBasis:'public_information',legalEntityAndGroupPerimeter:'unconfirmed'}},
 M02:{type:'diagnostic_mandate',content:{focus:context.brief.content.focus??null,knownContext:context.brief.content.knownContext??null,intendedWorkProduct:'company_debt_diagnostic'}},
 M03:{type:'constraint_register',content:{constraints:['Public information only; no private document inference.','No underwriting, rating or lender decision.','No calculated capacity without reconciled financial inputs.','No lender matching, pricing or market contact.']}},
 M04:{type:'diagnostic_lenses',content:{lenses:['business_and_sector','earnings_and_cash_conversion','debt_and_liquidity','working_capital','downside_risk','capacity_evidence_gap'],treatment:'public_signals_not_company_truth'}},
 M05:{type:'diagnostic_definition',content:{sections:['executive_read','company_snapshot','evidence_coverage','business_risk_profile','financial_signals','debt_liquidity','working_capital','risks','capacity','hypotheses','information_requests','questions','unknowns'],acceptance:['Every company-specific claim cites a persisted public source.','Capacity remains uncalculated without reconciled inputs.','The next information batch is the whole residual, each request with its reason and the decision it changes.']}},
 M06:{type:'company_debt_execution_plan',content:{planId:context.plan.id,planFingerprint:context.plan.fingerprint,tasks:context.tasks.map(task=>({id:task.id,batch:task.batch,dependencies:task.dependencies})),modelInvocation:{task:'company_debt_view',maximum:input.maxDispatches,finalTaskId:'C11',executionPlanTaskId:'M06'},externalSearchQueries:8,finalGate:'user_confirmation_of_exact_artifact_fingerprint'}},
 };
 if(!Number.isInteger(input.maxDispatches)||input.maxDispatches<1||input.maxDispatches>2)throw new Error('capital_debt_task_budget_invalid');
 return products[taskId];
}
export function capitalCompanyDebtDerivedProduct(taskId:typeof capitalCompanyDebtDerivedIds[number],input:{company:{name:string;website:string|null};diagnostic:z.infer<typeof companyDebtDiagnosticSchema>;research:{status:'succeeded'|'partial';researchRunId:string;sources:readonly ResearchSource[]}}):{type:string;content:Record<string,unknown>}{
 const {diagnostic:d,company,research}=input;
 const products:{[K in typeof capitalCompanyDebtDerivedIds[number]]:{type:string;content:Record<string,unknown>}}={
 D01:{type:'document_ingestion_status',content:{status:'not_applicable_public_only',documents:[],reason:'This start is intentionally limited to public information; no private file was requested or ingested.'}},
 D02:{type:'document_classification_status',content:{status:'not_applicable_public_only',classifiedDocuments:[],publicResearchIsDocumentEvidence:false}},
 D03:{type:'document_extraction_status',content:{status:'not_applicable_public_only',extractedDocuments:[],publicSearchSnippetsAreNotExtractedFinancialStatements:true}},
 D04:{type:'document_fact_candidate_status',content:{status:'not_applicable_public_only',documentFactCandidates:[],publicSignalsRemainExternalContext:true}},
 D05:{type:'entity_period_unit_resolution',content:{companyName:company.name,website:company.website,legalEntity:'unconfirmed',groupPerimeter:'unconfirmed',periods:'not_normalized',currencyAndScale:'not_normalized',reason:'No private document set is available to resolve the accounting perimeter.'}},
 D06:{type:'evidence_reconciliation_status',content:{status:'not_reconciled_public_only',reconciledFinancialStatements:false,unresolvedConflicts:d.unknowns,conclusion:'Public sources remain external context and do not create reconciled Company Truth.'}},
 D07:{type:'accounting_identity_status',content:{accountingIdentitiesRun:false,reason:'No reconciled statements or normalized periods are available in the public-only start.',blockingForCalculatedCapacity:true}},
 C01:{type:'business_model_reconstruction',content:d.businessRiskProfile},
 C02:{type:'sector_regulatory_research',content:{status:research.status,researchRunId:research.researchRunId,sourceCount:research.sources.filter(s=>s.topic==='sector'||s.topic==='regulation').length,sources:research.sources.filter(s=>s.topic==='sector'||s.topic==='regulation').map(s=>({provider:s.provider,topic:s.topic,title:s.title,url:s.url,snippet:s.snippet,publishedAt:s.publishedAt,retrievedAt:s.retrievedAt,contentHash:s.contentHash})),failureDiagnostics:'not_retained',classification:'external_context_not_company_truth'}},
 C03:{type:'public_financial_spreading',content:{status:'not_computable_from_public_snippets',spreading:null,signals:d.financialSignals,missingInputs:d.evidenceCoverage.criticalMissingInputs}},
 C04:{type:'earnings_quality_analysis',content:{status:'public_signal_only',signals:d.financialSignals,normalizedEbitda:null,cashConversion:null}},
 C05:{type:'debt_economic_map',content:{status:'public_signal_only',debtSchedule:null,signals:d.debtAndLiquiditySignals}},
 C06:{type:'working_capital_analysis',content:{status:'public_signal_only',normalizedWorkingCapital:null,signals:d.workingCapitalSignals}},
 C07:{type:'projection_normalization',content:{status:'not_computable',projections:null,reason:'No reconciled management plan or comparable periods were supplied.'}},
 C08:{type:'scenario_stress_analysis',content:{status:'not_computable',scenarios:[],reason:'Stress tests require reconciled historicals, debt schedule and explicit assumptions.'}},
 C09:{type:'risk_mitigation_diagnostic',content:{risks:d.risks,diagnosticHypotheses:d.diagnosticHypotheses,unknowns:d.unknowns}},
 C10:{type:'capacity_assessment',content:d.capacityAssessment},
 };
 return products[taskId];
}
