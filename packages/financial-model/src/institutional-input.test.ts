import {describe,expect,it} from "vitest";
import type {ReconciledFact} from "@offroad/reconciliation";
import {prepareInstitutionalModelInput,type InstitutionalModelConfiguration,type InstitutionalFactSelection,type InstitutionalModelSource} from "./institutional-input";
import {buildInstitutionalFinancialModel} from "./institutional-model";
import type {AssumptionUnit} from "./assumptions";

import {institutionalInputFixture as fixture} from "./institutional-input.fixture";

describe("source-bound institutional input adapter",()=>{
  it("supports explicitly confirmed debt-free and no-capex scenarios",()=>{
    const input=fixture();input.configuration.debtInstruments=[];input.configuration.debtRateLineage=[];input.configuration.capex=[];
    for(const fact of input.facts){if(fact.key.fieldPath.endsWith("gross_debt")){fact.value="0";fact.accepted.normalizedValue="0";}if(fact.key.fieldPath.endsWith("equity")){fact.value="1100";fact.accepted.normalizedValue="1100";}}
    expect(prepareInstitutionalModelInput(input).missingInputs.map(g=>g.targetPath)).toEqual(expect.arrayContaining(["capex","debtInstruments"]));
    const confirmation={confirmedBy:"reviewing-finance-team",confirmedAt:"2026-09-09T12:00:00Z",rationale:"Confirmed no debt and no planned capital expenditure in this scenario"};
    input.configuration.absenceConfirmations={capex:confirmation,debtInstruments:confirmation};
    const ready=prepareInstitutionalModelInput(input);expect(ready.status).toBe("ready");expect(buildInstitutionalFinancialModel(ready.input!).periods.every(p=>p.balanceCheck==="0")).toBe(true);
  });

  it("binds existing facts and assumptions to a balanced annual model with no sector whitelist",()=>{
    const request=fixture();const result=prepareInstitutionalModelInput(request);
    expect(result.missingInputs).toEqual([]);expect(result.status).toBe("ready");
    expect(result.lineage).toHaveLength(15);expect(result.lineage[0]).toMatchObject({sourceVersion:"1",sourceHash:"a".repeat(64),periodEnd:"2026-12-31"});
    const model=buildInstitutionalFinancialModel(result.input!);
    expect(model.periods.map(p=>p.balanceCheck)).toEqual(["0","0","0","0"]);
    expect(model.periods.map(p=>p.depreciation)).toEqual(["50","100","100","100"]);
    request.facts.reverse();expect(prepareInstitutionalModelInput(request)).toEqual(result);
  });
  it("does not invent missing balances or tax carryforwards as zero",()=>{
    const request=fixture();request.facts=request.facts.filter(f=>!f.key.fieldPath.endsWith("restricted_cash")&&!f.key.fieldPath.endsWith("tax_loss_carryforward"));
    const result=prepareInstitutionalModelInput(request);expect(result.input).toBeNull();expect(result.inputFingerprint).toBeNull();
    expect(result.missingInputs.map(g=>g.targetPath)).toEqual(expect.arrayContaining(["openingBalanceSheet.restrictedCash","taxes.openingTaxLossCarryforward"]));
  });
  it.each(["disputed","anchor","period","entity","scope","value","projection","source_version","source_hash","scale","currency"])("fails locally for %s",issue=>{
    const request=fixture();const fact=request.facts[0]!;
    if(issue==="disputed")fact.disputed=true;
    if(issue==="anchor")fact.accepted.anchorVerified=false;
    if(issue==="period")fact.key.periodEnd="2025-12-31";
    if(issue==="entity")fact.key.entityName="Other company";
    if(issue==="scope")fact.accepted.entityScope="consolidated";
    if(issue==="value")fact.value="NaN";
    if(issue==="projection")fact.accepted.informationClass="projection";
    if(issue==="source_version")request.sources[0]!.version="2";
    if(issue==="source_hash")request.sources[0]!.hash="b".repeat(64);
    if(issue==="scale")request.sources[0]!.amountScale="millions";
    if(issue==="currency")request.sources[0]!.currency="USD";
    const result=prepareInstitutionalModelInput(request);expect(result.status).toBe("missing_inputs");expect(result.input).toBeNull();
  });
  it("requires a full annual historical revenue period instead of annualizing interim data",()=>{
    const request=fixture();request.facts.find(f=>f.key.fieldPath.endsWith("revenue"))!.accepted.periodStart="2026-07-01";
    expect(prepareInstitutionalModelInput(request).missingInputs).toContainEqual(expect.objectContaining({targetPath:"revenueSegments.activity.baseRevenue",code:"fact_invalid"}));
  });
  it("rejects duplicate facts and mixed opening perimeters",()=>{
    const request=fixture();request.facts.push(structuredClone(request.facts[0]!));
    expect(prepareInstitutionalModelInput(request).missingInputs).toContainEqual(expect.objectContaining({code:"fact_ambiguous"}));
    request.configuration.openingBalanceSheet.bindings.inventory.entityScope="segment";
    expect(prepareInstitutionalModelInput(request).missingInputs).toContainEqual(expect.objectContaining({targetPath:"openingBalanceSheet",code:"configuration_invalid"}));
  });
  it("does not consolidate an unrelated entity into company revenue",()=>{
    const request=fixture();request.configuration.revenueSegments[0]!.baseRevenue.entityName="Another business";
    expect(prepareInstitutionalModelInput(request).missingInputs).toContainEqual(expect.objectContaining({targetPath:"historicalPerimeter",code:"configuration_invalid"}));
  });
  it("rejects skipped or nonannual forecast periods",()=>{
    const request=fixture();request.configuration.assumptionBook.periods=["2027","2029"];
    expect(prepareInstitutionalModelInput(request).missingInputs).toContainEqual(expect.objectContaining({targetPath:"periods",code:"period_mismatch"}));
  });
  it("includes assumption-only source revisions in its input fingerprint",()=>{
    const request=fixture();request.sources.push({...request.sources[0]!,sourceDocument:"synthetic-budget",hash:"c".repeat(64)});
    request.configuration.assumptionBook.assumptions[0]!.evidence=[{sourceId:"synthetic-budget",title:"Synthetic separate budget",asOfDate:"2026-12-31"}];
    const before=prepareInstitutionalModelInput(request);expect(before.status).toBe("ready");
    request.sources[1]!.version="2";
    const after=prepareInstitutionalModelInput(request);expect(after.status).toBe("ready");expect(after.inputFingerprint).not.toBe(before.inputFingerprint);
  });
  it("rejects wrong assumption units, absent premises and implicit debt zero flows",()=>{
    const request=fixture();request.configuration.assumptionBook.assumptions=request.configuration.assumptionBook.assumptions.filter(a=>a.id!=="no-addition");
    request.configuration.workingCapital.dsoAssumptionId="no-change";
    delete request.configuration.debtInstruments[0]!.periods[0]!.drawdown;
    const result=prepareInstitutionalModelInput(request);expect(result.status).toBe("missing_inputs");
    expect(result.missingInputs.map(g=>g.code)).toEqual(expect.arrayContaining(["unit_mismatch","assumption_invalid","configuration_invalid"]));
  });
  it("invalidates changed source metadata and snapshots input against later mutation",()=>{
    const request=fixture();const original=prepareInstitutionalModelInput(request);
    request.sources[0]!.version="2";request.sources[0]!.hash="b".repeat(64);
    const selections=[...Object.values(request.configuration.openingBalanceSheet.bindings),request.configuration.revenueSegments[0]!.baseRevenue,request.configuration.taxes.openingTaxLossCarryforward,request.configuration.taxes.openingDisallowedInterestCarryforward];
    for(const selection of selections){selection.sourceVersion="2";selection.sourceHash="b".repeat(64);}
    const revised=prepareInstitutionalModelInput(request);expect(revised.status).toBe("ready");expect(revised.inputFingerprint).not.toBe(original.inputFingerprint);
    request.configuration.assumptionBook.assumptions[0]!.rationale="Changed later";
    expect(original.input!.assumptionBook.assumptions[0]!.rationale).toBe("Explicit synthetic premise");
  });
  it("reports unavailable configuration without synthesizing a model",()=>{
    expect(prepareInstitutionalModelInput({facts:[],sources:[]})).toMatchObject({status:"missing_inputs",input:null,missingInputs:[{code:"configuration_required"}]});
  });
});
