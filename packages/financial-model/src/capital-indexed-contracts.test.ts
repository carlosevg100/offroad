import {describe,expect,it} from "vitest";
import {buildIndexedContractEvents} from "@offroad/financial-core/indexed-contract-events";
import {capitalContractPreparationInputSchema} from "./capital-contract-preparation";
import {capitalContractPreparationFixture} from "@offroad/testing-fixtures/capital-structure-decision";
import {indexedCapitalFixture,indexedPacketFixture} from "./capital-indexed-contracts.test-support";
import {prepareCapitalContractEvidenceV2 as prepare} from "./capital-contract-preparation-v2";
import {prepareCapitalProcedurePacketV2 as packet} from "./capital-procedure-packet-v2";
import {capitalContractAdoptionFixture} from "./capital-contract-adoptions.test-support";
import {reconcileCapitalContractAdoptionsV2} from "./capital-contract-adoptions";
const terms=(i:ReturnType<typeof indexedCapitalFixture>)=>{const x=i.indexedContracts[0]!;if(x.status!=="calculable")throw new Error("fixture");return x.input;};

describe("source-bound indexed capital procedure v2",()=>{
  it("carries the independent amortization and coupon oracle through the full packet",()=>{
    const i=indexedPacketFixture();const before=JSON.stringify(i);const r=packet(i);const prepared=r.contracts[0]!.result;const result=prepared.indexedContracts[0]!.result!;
    expect(result.finalState).toMatchObject({principal:"72.6",accruedInterest:"0"});expect(result.payments.map(x=>[x.principal,x.interest])).toEqual([["44","0"],["0","20.57"]]);
    expect(result).toEqual(buildIndexedContractEvents(terms(i.contracts[0]!.preparation)));
    expect(r.status).toBe("partial");expect(r.contractualGaps[0]!.code).toBe("indexed_interest_interpretation_and_adoption_review_required");
    expect(r.grantsExecution).toBe(false);expect(r.mutatesWorkingBasis).toBe(false);expect(JSON.stringify(i)).toBe(before);
  });
  it("does not turn report cuts into economic events",()=>{
    const i=indexedCapitalFixture();const first=prepare(i).indexedContracts[0]!.result!;terms(i).reportDates=["2026-01-02","2026-01-03"];
    const second=prepare(i).indexedContracts[0]!.result!;
    expect(second.finalState).toEqual(first.finalState);expect(second.payments).toEqual(first.payments);expect(second.contractFingerprint).toBe(first.contractFingerprint);
  });
  it("resumes an indexed state with accrued interest without another correction of past index",()=>{
    const i=indexedCapitalFixture();const t=terms(i);const full=prepare(i).indexedContracts[0]!.result!;
    t.accruals=t.accruals.slice(0,1);t.events=t.events.slice(0,1);t.reportDates=[];const part=prepare(i).indexedContracts[0]!.result!;
    const resumed=indexedCapitalFixture();const next=terms(resumed);Object.assign(next.opening,part.finalState,{point:{cycleId:"cycle",elapsedUnits:1}});resumed.asOf=part.finalState.date;next.accruals=next.accruals.slice(1);next.events=next.events.slice(1);
    expect(prepare(resumed).indexedContracts[0]!.result!.finalState).toEqual(full.finalState);
  });
  it.each(["opening","cycle","accrual","rate","convention","event"])("rejects foreign source at %s",part=>{
    const i=indexedCapitalFixture();const t=terms(i);const a=part==="opening"?t.opening.anchor:part==="cycle"?t.indexCycles[0]!.anchor:part==="accrual"?t.accruals[0]!.anchor:part==="rate"?t.accruals[0]!.interest.anchor:part==="convention"?t.conventions.anchor:t.events[0]!.anchor;
    a.sourceVersionId="00000000-0000-4000-8000-999999999999";expect(()=>prepare(i)).toThrow("source_version_missing");
  });
  it("keeps every anchor locator and source observation receipt",()=>{
    const r=prepare(indexedCapitalFixture());expect(r.sourceBindings.some(b=>b.path==="indexedContracts.0.input.accruals.0.interest.anchor"&&b.locator==="synthetic deed clause 1")).toBe(true);
    expect(r.sourceBindings.every(b=>b.observationIds.length>0)).toBe(true);
  });
  it("rejects currency date and projection horizon mismatch",()=>{
    const i=indexedCapitalFixture();terms(i).currency="USD";expect(()=>prepare(i)).toThrow("context_mismatch");
    const j=indexedCapitalFixture();j.asOf="2026-01-02";expect(()=>prepare(j)).toThrow("context_mismatch");
    const k=indexedPacketFixture();const t=terms(k.contracts[0]!.preparation);t.accruals[1]!.date="2028-01-01";t.indexCycles[0]!.end="2028-01-01";t.events[1]!.date="2028-01-01";t.reportDates=[];
    expect(()=>packet(k)).toThrow("horizon_mismatch");
  });
  it("retains a named gap for incomplete and absent inventory entries",()=>{
    const i=indexedPacketFixture();const p=i.contracts[0]!.preparation;const anchor=p.inventory[0]!.anchor;
    p.indexedContracts=[{instrumentId:"bond",seriesId:"A",status:"insufficient_terms",missingTerms:["payment_events"],anchors:[anchor]}];
    expect(packet(i).contractualGaps.some(g=>g.code==="contract_term_missing:payment_events:bond:A")).toBe(true);
    p.indexedContracts=[];expect(packet(i).contractualGaps.some(g=>g.code==="contract_terms_missing:bond:A")).toBe(true);
    expect(packet(i).status).toBe("partial");
  });
  it("preserves maximum-length economic identities in named missing-term gaps",()=>{
    const i=indexedPacketFixture();const p=i.contracts[0]!.preparation;p.indexedContracts=[];p.inventory[0]!.instrumentId="i".repeat(160);p.inventory[0]!.seriesId="s".repeat(160);
    expect(packet(i).contractualGaps[0]!.code).toBe(`contract_terms_missing:${"i".repeat(160)}:${"s".repeat(160)}`);
  });
  it("refuses legacy IPCA rather than calculating with reporting periods",()=>{
    const legacy=capitalContractPreparationInputSchema.parse(capitalContractPreparationFixture());legacy.interest!.series[0]!.indexer="IPCA";
    const i=indexedCapitalFixture();i.interest=legacy.interest;i.interestConventions=legacy.interestConventions;
    expect(()=>prepare(i)).toThrow("capital_indexed_contract_explicit_terms_required");
  });
  it("rejects duplicate economic identities even in distinct envelopes",()=>{
    const i=indexedPacketFixture();i.contracts.push({...structuredClone(i.contracts[0]!),id:"different-envelope"});
    expect(()=>packet(i)).toThrow("duplicate_economic_identity");
    const j=indexedCapitalFixture();j.indexedContracts.push(structuredClone(j.indexedContracts[0]!));expect(()=>prepare(j)).toThrow("duplicate_identity");
  });
  it("allows the same series in another alternative with its own context",()=>{
    const i=indexedPacketFixture();const other=i.decision.review.composition.alternatives[1]!;const copy=structuredClone(i.contracts[0]!);copy.id="other";copy.alternativeId=other.id;copy.preparation.scenario=other.projection.operating.scenario;i.contracts.push(copy);
    expect(packet(i).contracts).toHaveLength(2);
  });
  it("rejects indexed and legacy identity collisions and unmapped legacy series",()=>{
    const i=indexedCapitalFixture();const old=capitalContractPreparationInputSchema.parse(capitalContractPreparationFixture());i.interest=old.interest;i.interestConventions=old.interestConventions;
    expect(()=>prepare(i)).toThrow("series_binding_missing");
    i.legacySeriesBindings=[{instrumentId:"bond",seriesId:"A",legacySeriesId:old.interest!.series[0]!.id}];expect(()=>prepare(i)).toThrow("inventory_mismatch");
  });
  it("recomputes covenant derivation under v2 and rejects a v1 receipt",()=>{
    const f=capitalContractAdoptionFixture();const p={...f.input.preparation,schemaVersion:"capital-contract-preparation-input.v2" as const,inventory:[],legacySeriesBindings:[],indexedContracts:[]};
    expect(()=>reconcileCapitalContractAdoptionsV2({...f.input,preparation:p})).toThrow("derivation_binding_mismatch");
    const prepared=prepare(p);f.input.origins.forEach(o=>o.calculationFingerprint=prepared.fingerprint);
    expect(reconcileCapitalContractAdoptionsV2({...f.input,preparation:p}).status).toBe("aligned");
  });
});
