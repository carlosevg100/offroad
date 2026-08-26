import {describe,expect,it} from "vitest";
import {assessMandateFit} from "./fit";
import {resolveMandate,type Mandate} from "./mandate";
import {buildMarketTruthSet} from "./market-truth";

const sourced=<T>(value:T,provenance:"declared"|"inferred"="declared",observedAt="2026-08-01")=>[{value,provenance,observedAt}];
const mandate=(overrides:Partial<Mandate>={}):Mandate=>({
  fundId:"fund-1",fundName:"Fundo Um",ticket:sourced({min:"10000000",max:"80000000"}),termMonths:sourced({min:24,max:60}),sectors:sourced(["Varejo"]),instruments:sourced(["ccb"]),collateral:sourced(["recebiveis"]),geographies:sourced(["SP"]),leverageCeiling:sourced("4.0"),minimumDscr:sourced("1.2"),active:sourced(true),...overrides,
});

describe("M8 market truth set",()=>{
  it("screens without a score and marks every post-introduction procedure outside scope",()=>{
    const resolved=resolveMandate(mandate(),{asOf:"2026-08-24"});
    const fit=assessMandateFit(resolved,{amount:"40000000",termMonths:48,sector:"Varejo",geography:"SP",instruments:["ccb"],collateral:["recebiveis"],leverage:"3.0",dscr:"1.5"});
    const truth=buildMarketTruthSet({mandates:[resolved],fits:[fit],structuralExclusions:[],mandateMaxAgeMonths:12,waveLimit:3,caseFingerprint:"case-1",materialGate:{releaseDecision:"internal_only",fingerprint:null,recipientIds:[]}});
    expect(truth.screening).toMatchObject({fits:1,possible:0,excluded:0,blockedByMandateGovernance:0});
    expect(truth.shortlist[0]).toMatchObject({eligibleForShortlist:true,verdict:"fits"});
    expect(JSON.stringify(truth)).not.toMatch(/score|percent/);
    expect(truth.procedureCoverage).toHaveLength(28);
    expect(truth.procedureCoverage.slice(18).every((procedure)=>procedure.status==="not_applicable")).toBe(true);
  });

  it("blocks inferred or stale hard filters instead of testing them in market",()=>{
    const resolved=resolveMandate(mandate({termMonths:sourced({min:24,max:60},"inferred","2024-01-01")}),{asOf:"2026-08-24"});
    const fit=assessMandateFit(resolved,{amount:"40000000",termMonths:48,sector:"Varejo",geography:"SP",instruments:["ccb"],collateral:["recebiveis"],leverage:"3.0",dscr:"1.5"});
    const truth=buildMarketTruthSet({mandates:[resolved],fits:[fit],structuralExclusions:[],mandateMaxAgeMonths:12,waveLimit:3,caseFingerprint:"case-1",materialGate:{releaseDecision:"internal_only",fingerprint:null,recipientIds:[]}});
    expect(truth.shortlist[0]?.eligibleForShortlist).toBe(false);
    expect(truth.shortlist[0]?.blockers).toEqual(expect.arrayContaining(["mandate_stale:term","mandate_unconfirmed:term"]));
    expect(truth.status).toBe("blocked");
  });

  it("allows only an exact-fingerprint authorized introduction to a named current recipient",()=>{
    const resolved=resolveMandate(mandate(),{asOf:"2026-08-24"});
    const fit=assessMandateFit(resolved,{amount:"40000000",termMonths:48,sector:"Varejo",geography:"SP",instruments:["ccb"],collateral:["recebiveis"],leverage:"3.0",dscr:"1.5"});
    const baseline=buildMarketTruthSet({mandates:[resolved],fits:[fit],structuralExclusions:[],mandateMaxAgeMonths:12,waveLimit:3,caseFingerprint:"case-1",materialGate:{releaseDecision:"internal_only",fingerprint:null,recipientIds:[]}});
    const mandateFingerprint=baseline.shortlist[0]!.mandateFingerprint;
    const recipient={fundId:"fund-1",contactId:"contact-1",rationale:"Ticket, prazo, instrumento e perfil de risco dentro do mandato confirmado.",materialKinds:["teaser"],materialFingerprint:"materials-1",mandateFingerprint,order:1,anchor:true};
    const authorization={id:"auth-1",caseFingerprint:"case-1",materialFingerprint:"materials-1",authorizedBy:"company-user",authorizedAt:"2026-08-24T12:00:00.000Z",recipientIds:["fund-1"],scope:["teaser"]};
    const truth=buildMarketTruthSet({mandates:[resolved],fits:[fit],structuralExclusions:[],mandateMaxAgeMonths:12,waveLimit:3,caseFingerprint:"case-1",materialGate:{releaseDecision:"authorized_for_named_recipients",fingerprint:"materials-1",recipientIds:["fund-1"]},recipients:[recipient],authorization,introductions:[{id:"intro-1",fundId:"fund-1",contactId:"contact-1",materialFingerprint:"materials-1",authorizationId:"auth-1",introducedBy:"desk-user",introducedAt:"2026-08-24T13:00:00.000Z"}]});
    expect(truth.distribution).toMatchObject({ready:true,companyApproved:true});
    expect(truth.introductions).toMatchObject({introduced:1,blocked:0});
    expect(truth.procedureCoverage.find((procedure)=>procedure.procedureId==="MK-18")?.status).toBe("completed");
  });
});

