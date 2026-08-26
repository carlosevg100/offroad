import {describe,expect,it} from "vitest";
import type {ReconciledFact} from "@offroad/reconciliation";
import {buildRedFlagTruthSet,type RedFlagDetectorObservation} from "./red-flag-truth";

const fp="a".repeat(64);
const policy={version:"2026.08.26-v1",status:"active" as const,validFrom:"2026-08-01",validUntil:"2026-12-31",thresholds:{inventoryRevenueGrowthGapPct:"10",highCashToDebtPct:"50",highDebtCostPct:"15",changingInformationVersions:3}};
const facts:ReconciledFact[]=[
  {key:{fieldPath:"historical_financials.2024.inventory"},value:"100",valueType:"number",accepted:{fieldPath:"historical_financials.2024.inventory",normalizedValue:"100",valueType:"number",sourceDocument:"df",evidenceRank:1,informationClass:"audited",confidence:1,anchorVerified:true},conflicts:[],disputed:false},
  {key:{fieldPath:"historical_financials.2025.inventory"},value:"150",valueType:"number",accepted:{fieldPath:"historical_financials.2025.inventory",normalizedValue:"150",valueType:"number",sourceDocument:"df",evidenceRank:1,informationClass:"audited",confidence:1,anchorVerified:true},conflicts:[],disputed:false},
  {key:{fieldPath:"historical_financials.2024.revenue"},value:"100",valueType:"number",accepted:{fieldPath:"historical_financials.2024.revenue",normalizedValue:"100",valueType:"number",sourceDocument:"df",evidenceRank:1,informationClass:"audited",confidence:1,anchorVerified:true},conflicts:[],disputed:false},
  {key:{fieldPath:"historical_financials.2025.revenue"},value:"110",valueType:"number",accepted:{fieldPath:"historical_financials.2025.revenue",normalizedValue:"110",valueType:"number",sourceDocument:"df",evidenceRank:1,informationClass:"audited",confidence:1,anchorVerified:true},conflicts:[],disputed:false},
];
const observation=(flagId:`RF-${string}`,severity:"high"|"critical"="high"):RedFlagDetectorObservation=>({flagId,status:"candidate",severity,detail:`${flagId}_detected`,supportIds:[`support:${flagId}`],observedAt:"2026-08-26"});

describe("M9 red flag truth set",()=>{
  it("detects a numeric signal but never confirms it automatically",()=>{
    const truth=buildRedFlagTruthSet({referenceDate:"2026-08-26",caseFingerprint:fp,facts,exceptions:[],policy});
    const finding=truth.findings.find((entry)=>entry.flagId==="RF-01")!;
    expect(finding).toMatchObject({detectorStatus:"candidate",status:"candidate",reviewStatus:"pending",blocksExternalOutputs:true});
    expect(finding.evidenceIds).toHaveLength(4);
  });

  it("applies a review only to the exact flag fingerprint and preserves stale decisions",()=>{
    const first=buildRedFlagTruthSet({referenceDate:"2026-08-26",caseFingerprint:fp,facts,exceptions:[],policy});
    const rf01=first.findings.find((entry)=>entry.flagId==="RF-01")!;
    const current=buildRedFlagTruthSet({referenceDate:"2026-08-26",caseFingerprint:fp,facts,exceptions:[],policy,reviews:[{flagId:"RF-01",flagFingerprint:rf01.fingerprint,decision:"false_positive",rationale:"Compra antecipada coberta por contratos.",evidenceIds:["contract:1"],decidedBy:"analyst",decidedAt:"2026-08-26T10:00:00Z"}]});
    expect(current.findings.find((entry)=>entry.flagId==="RF-01")).toMatchObject({status:"false_positive",reviewStatus:"current",blocksExternalOutputs:false});
    const stale=buildRedFlagTruthSet({referenceDate:"2026-08-26",caseFingerprint:"b".repeat(64),facts,exceptions:[],policy,reviews:[{flagId:"RF-01",flagFingerprint:rf01.fingerprint,decision:"false_positive",rationale:"versão antiga",evidenceIds:["contract:1"],decidedBy:"analyst",decidedAt:"2026-08-26T10:00:00Z"}]});
    expect(stale.findings.find((entry)=>entry.flagId==="RF-01")).toMatchObject({status:"candidate",reviewStatus:"stale"});
  });

  it("composes only confirmed flags and asks the desk rather than auto-declining",()=>{
    const detectors=[observation("RF-05"),observation("RF-06")];
    const first=buildRedFlagTruthSet({referenceDate:"2026-08-26",caseFingerprint:fp,facts:[],exceptions:[],policy,detectorObservations:detectors});
    const reviews=first.findings.filter((entry)=>entry.flagId==="RF-05"||entry.flagId==="RF-06").map((entry)=>({flagId:entry.flagId as `RF-${string}`,flagFingerprint:entry.fingerprint,decision:"confirmed" as const,rationale:"Confirmado nas demonstrações.",evidenceIds:entry.evidenceIds,decidedBy:"analyst",decidedAt:"2026-08-26T10:00:00Z"}));
    const truth=buildRedFlagTruthSet({referenceDate:"2026-08-26",caseFingerprint:fp,facts:[],exceptions:[],policy,detectorObservations:detectors,reviews});
    expect(truth.families.find((entry)=>entry.id==="culture_of_numbers")).toMatchObject({severity:"critical",requiresDeskDecision:true});
    expect(truth.mandate).toMatchObject({recommendation:"decline_review_required",decision:null,decisionStatus:"missing",externalOutputsAllowed:false});
    expect(truth.findings.find((entry)=>entry.flagId==="RF-18")?.status).toBe("candidate");
  });

  it("binds the human mandate decision and decline communication to exact fingerprints",()=>{
    const detector=observation("RF-15","critical");
    const initial=buildRedFlagTruthSet({referenceDate:"2026-08-26",caseFingerprint:fp,facts:[],exceptions:[],policy,detectorObservations:[detector]});
    const flag=initial.findings.find((entry)=>entry.flagId==="RF-15")!;
    const reviewed=buildRedFlagTruthSet({referenceDate:"2026-08-26",caseFingerprint:fp,facts:[],exceptions:[],policy,detectorObservations:[detector],reviews:[{flagId:"RF-15",flagFingerprint:flag.fingerprint,decision:"confirmed",rationale:"Analítico essencial recusado.",evidenceIds:flag.evidenceIds,decidedBy:"analyst",decidedAt:"2026-08-26T10:00:00Z"}]});
    const decision={assessmentFingerprint:reviewed.mandate.assessmentFingerprint,decision:"decline" as const,reasonCodes:["RF-15"],conditions:[],pathBack:"Reabrir após entrega do analítico.",decidedBy:"head-dcm",decidedAt:"2026-08-26T11:00:00Z"};
    const declined=buildRedFlagTruthSet({referenceDate:"2026-08-26",caseFingerprint:fp,facts:[],exceptions:[],policy,detectorObservations:[detector],reviews:[{flagId:"RF-15",flagFingerprint:flag.fingerprint,decision:"confirmed",rationale:"Analítico essencial recusado.",evidenceIds:flag.evidenceIds,decidedBy:"analyst",decidedAt:"2026-08-26T10:00:00Z"}],mandateDecision:decision});
    expect(declined.mandate).toMatchObject({decisionStatus:"current",externalOutputsAllowed:false,qualifiedIntroductionAllowed:false});
    expect(declined.declineCommunication).toMatchObject({required:true,completed:false,status:"missing"});
    expect(declined.findings.find((entry)=>entry.flagId==="RF-20")?.status).toBe("candidate");
    const stale=buildRedFlagTruthSet({referenceDate:"2026-08-26",caseFingerprint:fp,facts:[],exceptions:[],policy,detectorObservations:[detector],reviews:[{flagId:"RF-15",flagFingerprint:flag.fingerprint,decision:"confirmed",rationale:"Analítico essencial recusado.",evidenceIds:flag.evidenceIds,decidedBy:"analyst",decidedAt:"2026-08-26T10:00:00Z"}],mandateDecision:decision,declineCommunication:{mandateDecisionFingerprint:"wrong",channel:"email",recipient:"company",sentBy:"head-dcm",sentAt:"2026-08-26T12:00:00Z",messageFingerprint:"c".repeat(64)}});
    expect(stale.declineCommunication.status).toBe("stale");
    const decisionFingerprint=declined.findings.find((entry)=>entry.flagId==="RF-20")!.evidenceIds[0]!;
    const complete=buildRedFlagTruthSet({referenceDate:"2026-08-26",caseFingerprint:fp,facts:[],exceptions:[],policy,detectorObservations:[detector],reviews:[{flagId:"RF-15",flagFingerprint:flag.fingerprint,decision:"confirmed",rationale:"Analítico essencial recusado.",evidenceIds:flag.evidenceIds,decidedBy:"analyst",decidedAt:"2026-08-26T10:00:00Z"}],mandateDecision:decision,declineCommunication:{mandateDecisionFingerprint:decisionFingerprint,channel:"email",recipient:"company",sentBy:"head-dcm",sentAt:"2026-08-26T12:00:00Z",messageFingerprint:"c".repeat(64)}});
    expect(complete.declineCommunication).toMatchObject({status:"current",completed:true});
    expect(complete.findings.find((entry)=>entry.flagId==="RF-20")?.status).toBe("clear");
  });

  it("covers all twenty procedures and reports missing policy instead of guessing",()=>{
    const truth=buildRedFlagTruthSet({referenceDate:"2026-08-26",caseFingerprint:fp,facts:[],exceptions:[]});
    expect(truth.findings).toHaveLength(20);
    expect(truth.procedureCoverage.map((entry)=>entry.procedureId)).toEqual(Array.from({length:20},(_,index)=>`RF-${String(index+1).padStart(2,"0")}`));
    expect(truth.policy).toMatchObject({status:"missing",current:false});
    expect(truth.findings.slice(0,17).every((entry)=>entry.status==="not_computable")).toBe(true);
  });
});
