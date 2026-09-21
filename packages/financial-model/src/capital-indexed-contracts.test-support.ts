import {createHash} from "node:crypto";
import {capitalContractPreparationFixture} from "@offroad/testing-fixtures/capital-structure-decision";
import {capitalContractPreparationV2InputSchema} from "./capital-contract-preparation-v2";
import {capitalPacketFixture} from "./capital-procedure-packet.test-support";
import {capitalProcedurePacketV2InputSchema} from "./capital-procedure-packet-v2";

/** Synthetic rational-oracle contract, never exported to application consumers. */
export function indexedCapitalFixture() {
  const old=capitalContractPreparationFixture();
  const anchor={sourceVersionId:old.sources[0]!.sourceVersionId,locator:"synthetic deed clause 1"};
  return capitalContractPreparationV2InputSchema.parse({...old,schemaVersion:"capital-contract-preparation-input.v2",interest:null,interestConventions:null,covenants:null,
    inventory:[{instrumentId:"bond",seriesId:"A",kind:"indexed",anchor}],legacySeriesBindings:[],
    indexedContracts:[{instrumentId:"bond",seriesId:"A",status:"calculable",input:{schemaVersion:"indexed-contract-events-input.v1",currency:"BRL",
      opening:{date:old.asOf,moment:"after_events",principal:"100",accruedInterest:"0",accruedIndexation:"0",appliedIndexLevel:"1",point:{cycleId:"cycle",elapsedUnits:0},anchor},
      indexCycles:[{id:"cycle",start:old.asOf,end:"2026-01-03",totalUnits:2,variation:{kind:"monthly_rate",value:"0.21"},floor:"none",anchor}],
      accruals:["2026-01-02","2026-01-03"].map((date,n)=>({date,point:{cycleId:"cycle",elapsedUnits:n+1},interest:{kind:"effective_interval",value:"0.1",anchor},anchor})),
      conventions:{accrualBoundaryConvention:"explicit_contractual_grid",indexation:"capitalized_principal",interestPrincipal:"at_interest_accrual",indexationPrincipal:"at_indexation",unpaidIndexationAccrual:"compound_with_index",indexationOrder:0,interestOrder:1,cashResidual:"carry",indexAccruedInterest:true,compoundAccruedInterest:true,amortizationInterest:"retain",amortizationIndexation:"settle_proportionally",factorRounding:{decimals:16,mode:"half_up"},cashRounding:{decimals:16,mode:"half_up"},anchor},
      events:[{id:"amort",date:"2026-01-02",order:2,kind:"amortization",amount:"44",basis:"indexed_principal",anchor},{id:"coupon",date:"2026-01-03",order:2,kind:"coupon",anchor}],reportDates:["2026-01-03"]}}]});
}
export function indexedPacketFixture() {
  const packet=capitalPacketFixture();const preparation=capitalContractPreparationV2InputSchema.parse(JSON.parse(JSON.stringify(indexedCapitalFixture()).replaceAll("2026-01-", "2027-01-")));
  for (const a of [...packet.decision.review.composition.alternatives,...packet.decision.review.composition.sensitivities]) {
    const snapshot=JSON.parse(a.projection.operating.envelope.canonical);
    for(const e of snapshot.entries)e.dimensions.perimeter="consolidated";
    const canonical=JSON.stringify(snapshot);const envelope={canonical,fingerprint:createHash("sha256").update(canonical).digest("hex")};
    a.projection.operating.envelope=envelope;a.projection.operating.perimeter="consolidated";
    if(a.projection.funding.kind!=="debt")throw new Error("Synthetic debt fixture required");
    a.projection.funding.input.envelope=envelope;a.projection.funding.input.perimeter="consolidated";
  }
  const alternative=packet.decision.review.composition.alternatives[0]!;const p=alternative.projection.operating;
  Object.assign(preparation,{workId:p.scope.workId,purpose:p.scope.purpose,entityId:p.entityId,perimeter:p.perimeter,scenario:p.scenario,currency:p.currency});
  return capitalProcedurePacketV2InputSchema.parse({...packet,schemaVersion:"capital-procedure-packet-input.v2",contracts:[{id:"indexed",alternativeId:alternative.id,preparation}]});
}

import {integratedCapitalPacketFixture} from "./capital-procedure-packet.test-support";
import {prepareCapitalContractEvidenceV2} from "./capital-contract-preparation-v2";
export function capitalPacketV2Fixture() {
  return capitalProcedurePacketV2InputSchema.parse({...capitalPacketFixture(),schemaVersion:"capital-procedure-packet-input.v2"});
}
export function integratedCapitalPacketV2Fixture() {
  const old=integratedCapitalPacketFixture();
  const contracts=old.contracts.map(c=>({...c,preparation:{...c.preparation,schemaVersion:"capital-contract-preparation-input.v2" as const,inventory:[],legacySeriesBindings:[],indexedContracts:[]}}));
  const packet=capitalProcedurePacketV2InputSchema.parse({...old,schemaVersion:"capital-procedure-packet-input.v2",contracts});
  for(const link of packet.adoptionLinks){const prepared=prepareCapitalContractEvidenceV2(packet.contracts.find(c=>c.id===link.contractId)!.preparation);link.origins.forEach(o=>o.calculationFingerprint=prepared.fingerprint);}
  return packet;
}
