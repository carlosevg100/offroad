import type {DebtTruthSet, FinancialTruthSet, ReconciledFact} from "@offroad/reconciliation";
import {describe, expect, it} from "vitest";

import {compileStructureAlternatives, fingerprintStructureAlternative, fingerprintStructureVerificationContext, type StructureAlternativeDraft} from "./alternatives";
import {designCollateralPackage} from "./collateral";
import {buildOperationTruthSet, type OperationTruthSet} from "./operation";

/**
 * The deliberate differences of the move of the deal structure's arithmetic into
 * `@offroad/financial-core` (stage 19, third polish, part 2B): each assertion below failed on the
 * sources before the move. The decimal comma of the capacity walls is tested in `index.test.ts`.
 */
const f = (fieldPath: string, value: string, valueType: ReconciledFact["valueType"] = "number"): ReconciledFact => ({
  key: {fieldPath}, value, valueType,
  accepted: {fieldPath, normalizedValue: value, valueType, sourceDocument: "gold.xlsx", evidenceRank: 2, informationClass: "company_document", confidence: 1, anchorVerified: true, anchor: {sheet: "Inputs", cell: "A1"}},
  conflicts: [], disputed: false,
});

describe("the deliberate differences of the deal structure's move to financial-core", () => {
  it("states the amount a package lacks as every material states an amount, never as raw digits", () => {
    // The synthetic Aurora case of the materials: 42,3M asked against R$ 27,54M of free receivables at a 30% haircut.
    const pkg = designCollateralPackage({assets: [{description: "Recebíveis", type: "receivables", value: "51940000", encumbered: "24400000"}], amount: "42300000"});
    expect(pkg.shortfall).toBe("35712000.00");
    expect(pkg.notes[0]!.pt).toBe("O inventário cobre 0,46x do pedido contra 1,30x exigidos: faltam R$ 35.712.000 de valor elegível. Ou a empresa nomeia outro ativo, ou o tíquete cai, ou a cobertura se completa com garantia de terceiro.");
    expect(pkg.notes[0]!.en).toBe("The inventory covers 0.46x of the ask against 1.30x required: R$ 35,712,000 of eligible value is missing. Either the company names another asset, the ticket comes down, or a third-party guarantee completes the coverage.");
  });

  it("reads the operation's facts in decimal notation: an empty or hexadecimal fact is no figure", () => {
    const financialTruth = {statements: [{period: "2025", adjustedEbitda: "35"}]} as unknown as FinancialTruthSet;
    const debtTruth = {
      status: "partial", instruments: [{id: "loan", principal: "60", principalBasis: "reported_principal"}], exceptions: [], missingInputs: [],
      views: {balanceBasis: "reported_instruments", grossFinancialDebt: "60", unrestrictedCash: "10", cashBasis: "reported"}, covenants: [],
    } as unknown as DebtTruthSet;
    const policies = {version: "2026.08.25-v1", sizingMateriality: "5", residualTolerance: "0"};
    const facts = [
      f("transaction.requested_amount", "100"), f("transaction.desired_term_months", ""),
      f("project.total_cost", "100"), f("transaction.incremental_working_capital", "20"), f("transaction.transaction_costs", "3"), f("transaction.execution_buffer", "7"),
      f("project.company_cash", "30"), f("project.shareholder_equity", "0x10"),
    ];
    const truth = buildOperationTruthSet({facts, financialTruth, debtTruth, capacity: null, referenceDate: "2026-08-25", policies});
    // An empty count was zero months.
    expect(truth.request.termMonths).toBeNull();
    // "0x10" was read as 16 of shareholder equity and took 16 off the calculated need.
    expect(truth.calculatedNeed?.value).toBe("100");
    // An empty buffer made the need throw; it is now missing, and asked for.
    const empty = buildOperationTruthSet({facts: facts.map((fact) => (fact.key.fieldPath === "transaction.execution_buffer" ? f(fact.key.fieldPath, "") : fact)), financialTruth, debtTruth, capacity: null, referenceDate: "2026-08-25", policies});
    expect(empty.calculatedNeed).toBeNull();
    expect(empty.missingInputs).toContain("transaction.execution_buffer");
  });

  it("keeps sources and uses from closing on a line that is not a figure, and refuses an amount that is not one instead of failing", () => {
    const operationTruth = {version: "operation-v1", status: "complete", sourcesAndUses: {status: "pass", totalSources: "100000000", totalUses: "100000000"}} as OperationTruthSet;
    const structureTruth = {
      version: "structure-v1", status: "partial", proposal: {instrument: "ccb", amount: "100000000", termMonths: 48, graceMonths: 6, amortizationFormat: "sac"},
      capacityEnvelope: {amount: "100000000"}, dayOne: {passes: true},
    } as Parameters<typeof compileStructureAlternatives>[0]["structureTruth"];
    const line = (id: string, amount: string, origin: "calculation" | "proposal") => ({id, label: id, amount, origin, basisIds: [`basis.${id}`], condition: origin === "proposal" ? "proposed" as const : "available" as const});
    const draft = (amount: string, source: string, use: string): StructureAlternativeDraft => ({
      id: "ccb", label: "CCB", instrument: "ccb", route: "ccb", amount, currency: "BRL", termMonths: 48, graceMonths: 6, amortization: "sac", indexer: "CDI",
      targetBuyer: "private_credit_funds", rationale: "r", pros: [], cons: [], assumptions: [],
      sources: [line("debt", source, "proposal")], uses: [line("capex", use, "calculation")],
      security: [{description: "Receivables", basisIds: ["ES-11"]}], covenants: [{description: "DSCR", basisIds: ["ES-24"]}],
      conditionsPrecedent: [{description: "Approvals", owner: "company", basisIds: ["ES-42"]}], implementationDays: {min: 30, max: 45, basisIds: ["ES-44"]}, basisIds: ["C10"],
    });
    const compile = (alternative: StructureAlternativeDraft) => compileStructureAlternatives({
      proposal: {alternatives: [alternative], recommendation: {alternativeId: "ccb", rationale: "Candidate", basisIds: ["ES-45"], proposedBy: "desk", proposedAt: "2026-08-29T12:00:00Z"}},
      operationTruth, structureTruth, instruments: [{instrument: {id: "ccb"}, eligible: true} as never],
      verificationByAlternative: {ccb: {
        alternativeFingerprint: fingerprintStructureAlternative(alternative), contextFingerprint: fingerprintStructureVerificationContext(operationTruth, structureTruth),
        verifierVersion: "deterministic-v1", verifiedAt: "2026-08-29T12:00:00Z", operationTruth, structureTruth,
      }},
    }).alternatives[0]!;
    // Lines written in words were skipped by the sum: zero against zero closed sources and uses.
    const prose = compile(draft("100000000", "R$ 100 milhões", "R$ 100 milhões"));
    expect(prose.gates.sourcesAndUsesClosed).toBe(false);
    expect(prose.blockers).toContain("alternative_sources_and_uses_not_closed");
    // A hexadecimal line was read as 100.000.000.
    expect(compile(draft("100000000", "0x5F5E100", "100000000")).gates.sourcesAndUsesClosed).toBe(false);
    // An amount that is not a figure made the verification comparison throw.
    const words = compile(draft("cem milhões", "100000000", "100000000"));
    expect(words.blockers).toEqual(expect.arrayContaining(["invalid_alternative_amount", "alternative_terms_not_verified"]));
  });
});
