/** Synthetic domain fixture ONLY. No SQL authority, human grants, licence,
 * SDK/model execution, or production completion is asserted by this helper.
 * Production must pass its real confirmed structure instead of this fixture. */
import {executeCaseEngine,publicCaseState,type CaseEngineInput} from '@offroad/case-engine';
import {supportedSemanticAudit} from '@offroad/case-understanding';
import type {FactCandidate} from '@offroad/reconciliation';
import {buildCapitalMaterialCompilerBundle} from '../capital-material-production-adapter';
const candidate = (
  fieldPath: string,
  normalizedValue: string,
  valueType: FactCandidate["valueType"] = "number",
  extra: Partial<FactCandidate> = {},
): FactCandidate => ({
  fieldPath,
  normalizedValue,
  valueType,
  sourceDocument: "source-1",
  evidenceRank: 1,
  informationClass: "audited",
  confidence: 0.99,
  anchorVerified: true,
  entityScope: "consolidated", currency: "BRL", unit: "currency", scale: "1",
  ...extra,
});

const documents = [
  {id: "d1", kind: "audited_financial_statements" as const},
  {id: "d2", kind: "trial_balance" as const},
  {id: "d3", kind: "debt_schedule" as const},
  {id: "d4", kind: "company_registration" as const},
  {id: "d5", kind: "capital_request_letter" as const},
  {id: "d6", kind: "business_plan" as const},
];

const structureProposal: NonNullable<CaseEngineInput["structureProposal"]> = {
  alternatives: [{
    id: "target-structure",
    label: "Estrutura-alvo",
    instrument: "ccb",
    route: "private_credit",
    amount: "10000000",
    currency: "BRL",
    termMonths: 48,
    graceMonths: 6,
    amortization: "sac",
    indexer: "CDI",
    targetBuyer: "private_credit_funds",
    rationale: "The structure follows the documented use and repayment capacity.",
    pros: ["Simple execution route"],
    cons: ["Pricing remains subject to market confirmation"],
    assumptions: ["The stated use remains unchanged"],
    sources: [{id: "new-debt", label: "New debt", amount: "10000000", origin: "proposal", basisIds: ["ES-45"], condition: "proposed"}],
    uses: [{id: "declared-use", label: "Declared use", amount: "10000000", origin: "company_input", basisIds: ["transaction.purpose"], condition: "available"}],
    security: [{description: "To be confirmed from available collateral", basisIds: ["ES-20"]}],
    covenants: [{description: "Minimum debt-service coverage", basisIds: ["ES-24"]}],
    conditionsPrecedent: [{description: "Corporate approvals", owner: "company", basisIds: ["ES-42"]}],
    implementationDays: {min: 20, max: 40, basisIds: ["ES-44"]},
    basisIds: ["ES-45"],
  }],
  recommendation: {
    alternativeId: "target-structure",
    rationale: "This is the simplest currently supportable route for the case.",
    basisIds: ["ES-41", "ES-45"],
    proposedBy: "test-structure-desk",
    proposedAt: "2026-08-24T12:00:00.000Z",
  },
};
const requiredStructureCandidates = [
  candidate("transaction.requested_amount", "10000000"),
  candidate("transaction.sources_and_uses.1.side", "sources", "text"),
  candidate("transaction.sources_and_uses.1.item", "New debt", "text"),
  candidate("transaction.sources_and_uses.1.amount", "10000000"),
  candidate("transaction.sources_and_uses.2.side", "uses", "text"),
  candidate("transaction.sources_and_uses.2.item", "Declared use", "text"),
  candidate("transaction.sources_and_uses.2.amount", "10000000"),
];


export async function buildMaterialCompilerReadyFixture(input:{sessionId:string;runId:string;writeBriefFailure?:boolean}){
 const base:CaseEngineInput={runId:input.runId,caseId:input.sessionId,archetypeId:'other',locale:'pt',referenceDate:'2026-10-02',candidates:[candidate('company.legal_name','Companhia sintética 3S','text'),candidate('historical_financials.2025.cash','10000000','number',{periodEnd:'2025-12-31'}),candidate('debt.total_gross','0'),candidate('historical_financials.2025.gross_debt','0','number',{periodEnd:'2025-12-31'}),candidate('historical_financials.2025.receivables','10000000','number',{periodEnd:'2025-12-31'}),candidate('historical_financials.2025.ebitda','25000000','number',{periodEnd:'2025-12-31'}),candidate('historical_financials.2025.revenue','100000000','number',{periodEnd:'2025-12-31'}),...requiredStructureCandidates],documents,roomDocuments:[],dealBrief:{requestedAmount:'10000000',requestedTermMonths:48,requestedGraceMonths:6,expectedRate:'0.18',instruments:['ccb']},resolvedMandates:[],externalReleaseApproved:false,operationPolicies:{version:'synthetic-operation.v1',residualTolerance:'0'},structurePolicies:{version:'synthetic-structure.v1',annualSizingRate:'0.18',rateConvention:'effective_annual',amortizationFormat:'sac',graceInterest:'paid'},informationAnswers:{info_why_now:'Necessidade com prazo econômico declarado.',info_business_model:'Venda recorrente de produtos e serviços.',info_customer_concentration:'Participação acompanhada por prazo contratual.'},structureProposal,writeBrief:async()=>{if(input.writeBriefFailure)throw new Error('synthetic_brief_compiler_failure');return {brief:{sections:[{id:'identity',heading:'Companhia',claims:[{id:'synthetic-company-name',text:'Companhia sintética 3S',kind:'fact',material:true,supportIds:['company.legal_name']}]}],executiveSummary:'Companhia sintética 3S'},blockedBy:[]};},verifyBrief:async({brief})=>({audit:supportedSemanticAudit(brief)})};
 const proposal=await executeCaseEngine(base);
 const proposalFingerprint=proposal.state.structureAlternatives.proposalFingerprint;
 if(!proposalFingerprint)throw new Error('synthetic_structure_did_not_compile');
 const result=await executeCaseEngine({...base,materialsPreparationApproved:true,plannedMaterialKinds:['teaser','financial_model','term_sheet','data_room_index'],structureConfirmation:{decision:'confirm',selectedAlternativeId:'target-structure',proposalFingerprint,actorId:'synthetic-domain-only-not-a-human-command',decidedAt:'2026-10-02T12:10:00.000Z'}});
 const bundle=buildCapitalMaterialCompilerBundle(result,input);
 return {result,bundle};
}
