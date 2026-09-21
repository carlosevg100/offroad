import {createHash} from "node:crypto";
import {deterministicRunEvidenceFingerprint, type DeterministicMethodRun, type DeterministicMethodRunCase} from "@offroad/credit-playbook";
import {capitalContractPreparationFixture} from "@offroad/testing-fixtures/capital-structure-decision";
import {capitalPacketV2Fixture as capitalPacketFixture, integratedCapitalPacketV2Fixture as integratedCapitalPacketFixture, indexedPacketFixture} from "./capital-indexed-contracts.test-support";
import {prepareCapitalProcedurePacketV2 as prepareCapitalProcedurePacket} from "./capital-procedure-packet-v2";
import {capitalContractPreparationInputSchema} from "./capital-contract-preparation";
import {prepareCapitalContractEvidenceV2 as prepareCapitalContractEvidence} from "./capital-contract-preparation-v2";

// Evaluation-only module; not exported to application consumers. All cases are synthetic.
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type CapitalProcedurePacketInput = ReturnType<typeof capitalPacketFixture>;
type Case = DeterministicMethodRunCase;
type Evidence = Omit<DeterministicMethodRun, "schemaVersion" | "humanApproval" | "run">;
export const capitalProcedureV2RunIds = {
  gold: "capital-structure-decision-2026-09-21-v3-gold",
  adversarial: "capital-structure-decision-2026-09-21-v3-adversarial",
  consistency: "capital-structure-decision-2026-09-21-v3-consistency",
} as const;

function observe(id: string, input: CapitalProcedurePacketInput, expected: unknown,
  select: (result: ReturnType<typeof prepareCapitalProcedurePacket>) => unknown): Case {
  const result = prepareCapitalProcedurePacket(input);
  const observed = JSON.stringify(select(result));
  const expectation = JSON.stringify(expected);
  return {id, expectation, observed, inputFingerprint: fingerprint(input),
    outputFingerprint: fingerprint(result), passed: expectation === observed};
}

function goldCases(): Case[] {
  const base = capitalPacketFixture();
  // Integer cents, independently specified from the Decimal implementation:
  // first operating cash=20000-9000-4000+500-1500-800-1200-2000=2000;
  // next operating cash=5000. First available=13000+2000+10000-500+8000=32500.
  // Redemption is 20000*(1+r)^2. Final available=32500+5000-redemption-1000.
  const initial = 32500n;
  const final = (rate: bigint, revenueDelta: bigint) =>
    (initial + 5000n - 20000n * (100n + rate) * (100n + rate) / 10000n - 1000n + 2n * revenueDelta).toString();
  const toCents = (s: string) => {
    const [whole, fraction = ""] = s.split(".");
    if (fraction.length > 2) throw new Error("Synthetic oracle expects exact cents");
    return (BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0")) * (s.startsWith("-") ? -1n : 1n)).toString();
  };
  const cash = observe("cash-identity-maintain-change-adverse", base,
    [final(10n, 0n), final(5n, 0n), final(10n, -2000n)],
    r => [...r.decision.alternatives, ...r.decision.sensitivities].map(a => toCents(a.projection.summary!.closingAvailable)));
  const integrated = integratedCapitalPacketFixture();
  const covenant = observe("contractual-definition-and-adopted-basis", integrated,
    {calculated: ["150", "100", "2"], adopted: "150", status: "aligned", packet: "partial"},
    r => ({calculated: r.adoptionLinks[0]!.result.alignment.map(a => a.calculated),
      adopted: r.decision.ratios[0]!.numerator, status: r.adoptionLinks[0]!.result.status, packet: r.status}));
  const noProjection = capitalPacketFixture();
  noProjection.decision.review.composition.alternatives = [];
  noProjection.decision.review.composition.sensitivities = [];
  noProjection.decision.review.alternativeConditions = [];
  const framed = observe("no-projection-no-fabricated-company", noProjection, {status: "framed", count: 0},
    r => ({status: r.status, count: r.decision.alternatives.length}));
  const missing = capitalPacketFixture();
  const revenue = missing.decision.review.composition.alternatives[0]!.projection.operating.revenue;
  if (revenue.mode !== "drivers") throw new Error("Synthetic driver fixture required");
  const selection = revenue.quantities;
  selection.decisionId = null; selection.missingReason = "Synthetic source absent";
  const absent = observe("absent-source-is-not-zero", missing, null, r => r.decision.alternatives[0]!.projection.summary);
  const divergent = integratedCapitalPacketFixture();
  divergent.contracts[0]!.preparation.covenants!.componentValues[0]!.value = "201";
  const calculationFingerprint = prepareCapitalContractEvidence(divergent.contracts[0]!.preparation).fingerprint;
  divergent.adoptionLinks[0]!.origins.forEach(o => {o.calculationFingerprint = calculationFingerprint;});
  const preserved = observe("contribution-does-not-overwrite-adoption", divergent,
    {calculated: "151", adopted: "150", status: "divergent"},
    r => ({calculated: r.adoptionLinks[0]!.result.alignment[0]!.calculated,
      adopted: r.decision.ratios[0]!.numerator, status: r.adoptionLinks[0]!.result.status}));
  const interest = integratedCapitalPacketFixture();
  const preparation = interest.contracts[0]!.preparation;
  const fixture = capitalContractPreparationInputSchema.parse(capitalContractPreparationFixture());
  preparation.interest = JSON.parse(JSON.stringify(fixture.interest).replaceAll("2026-01-01", preparation.asOf).replaceAll("2027-01-01", "2028-02-28"));
  preparation.interestConventions = fixture.interestConventions;
  preparation.inventory=[{instrumentId:"debt",seriesId:"debt",kind:"non_indexed",anchor:{sourceVersionId:preparation.sources[0]!.sourceVersionId,locator:"Synthetic clause 1"}}];
  preparation.legacySeriesBindings=[{instrumentId:"debt",seriesId:"debt",legacySeriesId:"debt"}];
  interest.adoptionLinks = [];
  const schedule = observe("interest-amortization-without-implied-cash-adoption", interest,
    {interest: "10", principal: "100", closing: "0", reviewRequired: true}, r => {
      const s = r.contracts[0]!.result.interest!.schedule_by_series[0]!;
      return {interest: s.totals!.cash_interest, principal: s.totals!.principal_paid,
        closing: s.rows![0]!.closing_principal,
        reviewRequired: r.contractualGaps.some(g => g.code === "interest_cash_timing_and_adoption_review_required")};
    });
  const negative = capitalPacketFixture();
  const snapshot = JSON.parse(negative.decision.review.composition.alternatives[0]!.projection.operating.envelope.canonical);
  snapshot.entries.find((e: {fieldPath: string; dimensions: {scenario: string}}) => e.fieldPath === "operating_projection.revenue.quantities" && e.dimensions.scenario === "house").value.value = ["1", "1"];
  const canonical = JSON.stringify(snapshot); const envelope = {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")};
  for (const a of [...negative.decision.review.composition.alternatives, ...negative.decision.review.composition.sensitivities]) {
    a.projection.operating.envelope = envelope;
    if (a.projection.funding.kind !== "debt") throw new Error("Synthetic debt fixture required");
    a.projection.funding.input.envelope = envelope;
  }
  const deficit = observe("negative-cash-does-not-consume-restricted-balance", negative,
    {available: "-237", restricted: "500", shortfall: "237"}, r => {
      const summary = r.decision.alternatives[0]!.projection.summary!;
      return {available: summary.closingAvailable, restricted: summary.closingRestricted, shortfall: summary.maximumAvailableShortfallAtMeasuredDates};
    });
  const indexed=observe("indexed-amortization-coupon-independent-oracle",indexedPacketFixture(),
    {principal:"72.6",interest:"0",payments:[["44","0"],["0","20.57"]],status:"partial"},r=>{
      const x=r.contracts[0]!.result.indexedContracts[0]!.result!;
      return {principal:x.finalState.principal,interest:x.finalState.accruedInterest,payments:x.payments.map(p=>[p.principal,p.interest]),status:r.status};
    });
  const termsMissing=indexedPacketFixture();termsMissing.contracts[0]!.preparation.indexedContracts=[];
  const missingIndexed=observe("known-indexed-contract-remains-unresolved",termsMissing,{status:"partial",gap:true},r=>({status:r.status,gap:r.contractualGaps.some(g=>g.code==="contract_terms_missing:bond:A")}));
  return [cash,covenant,framed,absent,preserved,schedule,deficit,indexed,missingIndexed];
}

function adversarialCases(): Case[] {
  const mutations: Array<[string, (input: CapitalProcedurePacketInput) => unknown, string]> = [
    ["tampered-envelope", i => {i.decision.review.composition.alternatives[0]!.projection.operating.envelope.canonical += " "; return i;}, "adoption_basis_integrity_mismatch"],
    ["cross-perimeter", i => {i.decision.review.composition.alternatives[0]!.projection.operating.perimeter = "individual"; return i;}, "operating_basis_context_mismatch"],
    ["foreign-contract-context", i => {i.contracts[0]!.preparation.scenario = "foreign"; return i;}, "context"],
    ["foreign-adoption-reference", i => {i.adoptionLinks[0]!.contractId = "foreign"; return i;}, "reference"],
    ["duplicate-adoption", i => {i.adoptionLinks.push(i.adoptionLinks[0]!); return i;}, "Duplicate"],
    ["fabricated-authority", i => ({...i, grantsExecution: true}), "unrecognized_keys"],
    ["fabricated-result", i => ({...i, result: {approved: true}}), "unrecognized_keys"],
    ["omitted-contract-direction", i => {
      const raw = JSON.parse(JSON.stringify(i)); delete raw.contracts[0].preparation.covenants.instruments[0].direction; return raw;
    }, "explicit_terms_required"],
  ];
  return mutations.map(([id, mutate, message]) => {
    const input = mutate(integratedCapitalPacketFixture());
    let observed = "accepted"; let passed = false;
    try {prepareCapitalProcedurePacket(input);} catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      passed = detail.includes(message); observed = passed ? "rejected by expected boundary" : `unexpected error: ${detail.slice(0, 250)}`;
    }
    return {id, expectation: "rejected by expected boundary", observed,
      inputFingerprint: fingerprint(input), outputFingerprint: fingerprint({observed}), passed};
  });
}

function consistencyCases(): Case[] {
  return [capitalPacketFixture(), integratedCapitalPacketFixture(), indexedPacketFixture()].flatMap((input, fixtureIndex) => {
    const before = fingerprint(input); const first = prepareCapitalProcedurePacket(input);
    return Array.from({length: 3}, (_, repeat) => {
      const result = prepareCapitalProcedurePacket(JSON.parse(JSON.stringify(input)));
      const passed = fingerprint(result) === fingerprint(first) && fingerprint(input) === before;
      return {id: `fixture-${fixtureIndex + 1}-repeat-${repeat + 1}`,
        expectation: "same inputs and versions reproduce all output bytes without mutation",
        observed: passed ? "same inputs and versions reproduce all output bytes without mutation" : "output or input changed",
        inputFingerprint: before, outputFingerprint: fingerprint(result), passed};
    });
  });
}

export function buildCapitalProcedureV2Runs(): Evidence[] {
  return ([{kind: "gold", cases: goldCases()}, {kind: "adversarial", cases: adversarialCases()},
    {kind: "consistency", cases: consistencyCases()}] as const).map(({kind, cases}) => {
    const evidence = {runId: capitalProcedureV2RunIds[kind], kind,
      method: {id: "prepare-capital-structure-decision", version: "2026.09.21-v3"},
      executor: {module: "@offroad/financial-model", exportName: "prepareCapitalProcedurePacketV2"},
      harness: {module: "@offroad/financial-model/src/capital-procedure-v2-runs.test-support.ts", exportName: "buildCapitalProcedureV2Runs"},
      modelCalls: 0 as const, cases, result: cases.every(c => c.passed) ? "pass" as const : "fail" as const};
    return {...evidence, evidenceFingerprint: deterministicRunEvidenceFingerprint(evidence),
      notes: "Synthetic deterministic execution. Numerical expectations do not constitute independent review, content approval, live access verification or publication. Contract interpretation remains explicit."};
  });
}
