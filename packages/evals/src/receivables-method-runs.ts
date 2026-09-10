import {
  deterministicRunEvidenceFingerprint,
  type DeterministicMethodRun,
  type DeterministicMethodRunCase,
} from "@offroad/credit-playbook";
import {
  receivablesCaseSchema,
  receivablesParametricScenarios,
  receivablesPoolUnderwritingVersion,
  underwriteReceivablesPool,
  type ReceivablesCase,
  type ReceivablesPoolUnderwritingInput,
} from "@offroad/receivables-analysis";
import {fakeco, fakecoReceivables} from "@offroad/testing-fixtures";
import {buildSyntheticReceivablesCase} from "@offroad/testing-fixtures/synthetic-receivables-case";

/**
 * The recorded gold, adversarial and consistency runs of the R01 method. The method declares zero
 * model calls, so the honest evidence for the `tested` rung is an execution, not a transcript: this
 * harness executes the published executor over the frozen Case 03 gold, the declared adversarial
 * scenarios and twenty row permutations, and writes what it observed. The committed records under
 * `packages/credit-playbook/knowledge/reviews/runs/` are compared against a fresh execution by
 * `receivables-method-runs.test.ts`, so a stale record fails instead of aging quietly.
 */
export const receivablesMethodRunIds = {
  gold: "underwrite-receivables-pool-2026-09-10-gold",
  adversarial: "underwrite-receivables-pool-2026-09-10-adversarial",
  consistency: "underwrite-receivables-pool-2026-09-10-consistency",
} as const;

const method = {id: "underwrite-receivables-pool", version: receivablesPoolUnderwritingVersion} as const;
const executor = {module: "@offroad/receivables-analysis", exportName: "underwriteReceivablesPool"} as const;
const harness = {module: "@offroad/evals/src/receivables-method-runs.ts", exportName: "buildReceivablesMethodRuns"} as const;

/** The declared adversarial ids of the method's frontmatter, in the order they are recorded. */
export const receivablesAdversarialRunCaseIds = [
  "r02-accounting-mismatch",
  "r11-single-debtor-concentration",
  "r15-encumbered-base",
  "r19-no-eligible-base",
  "r20-duplicate-cash",
] as const;

/** Case 03 (Aurora), assembled exactly as the frozen fixture gold assembles it. */
export function auroraGoldCase(): ReceivablesPoolUnderwritingInput["case"] {
  const rows = fakecoReceivables.buildReceivablesTape();
  const simple = buildSyntheticReceivablesCase({
    id: "gc03-aurora-2026-07",
    referenceDate: fakecoReceivables.receivablesReferenceDate,
    cedentName: fakeco.company.legalName,
    tape: rows.map((row) => ({
      receivableId: row.receivableId,
      debtorId: row.debtorId,
      balance: String(row.balance),
      daysPastDue: row.daysPastDue,
    })),
  });
  const encumbranceOf = new Map<string, "free" | "pledged" | "assigned">(rows.map((row) => [row.receivableId, row.encumbrance]));
  const sectorOf = new Map(rows.map((row) => [row.receivableId, row.sector]));
  return {
    ...simple,
    portfolio: simple.portfolio.map((item) => ({
      ...item,
      encumbrance: encumbranceOf.get(item.id) ?? "unknown",
      debtorSector: sectorOf.get(item.id) === "public" ? "public_sector" : "construction_distribution",
      sourceDocumentId: "10_Tape_Duplicatas_Jul2026.csv",
      sourceAnchor: `row:${item.id}`,
    })),
    accounting: {...simple.accounting, grossReceivablesBalance: String(fakeco.interim2026.receivables)},
    structure: {
      ...simple.structure,
      requestedFacility: String(fakeco.request.useOfProceeds[0]!.amount),
      actualSeniorAmount: String(fakeco.request.useOfProceeds[0]!.amount),
      actualSubordinatedAmount: "0",
    },
  };
}

/** Row order is presentation, never economics: the permutations must not move a single fingerprint. */
function permute(input: ReceivablesCase, seed: number): ReceivablesCase {
  const rotate = <T,>(rows: readonly T[], by: number) => rows.length === 0 ? [...rows] : [...rows.slice(by % rows.length), ...rows.slice(0, by % rows.length)];
  const reversed = seed % 2 === 1;
  const portfolio = rotate(input.portfolio, seed * 7 + 1);
  const cashReceipts = rotate(input.cashReceipts, seed * 3 + 1);
  return {
    ...input,
    portfolio: reversed ? [...portfolio].reverse() : portfolio,
    cashReceipts: reversed ? [...cashReceipts].reverse() : cashReceipts,
  };
}

function goldCases(): DeterministicMethodRunCase[] {
  const result = underwriteReceivablesPool({currency: "BRL", case: auroraGoldCase()});
  const expectation = "carteira 51940000.00, base elegivel preliminar 26217914.00, base ajustada 26217914.00, facilidade suportada 19663435.50 abaixo do pedido de 25000000.00, estado needs_remediation";
  const observed = `carteira ${result.portfolio_summary.totalOutstanding}, base elegivel preliminar ${result.portfolio_summary.preliminaryEligibleBalance}, base ajustada ${result.portfolio_summary.concentrationAdjustedEligibleBalance}, facilidade suportada ${result.borrowing_base.supportedFacility} abaixo do pedido de ${result.borrowing_base.requestedFacility}, estado ${result.state}`;
  return [{
    id: "gc03-assessor-recebiveis",
    expectation,
    observed,
    inputFingerprint: result.trace.input_fingerprint,
    outputFingerprint: result.trace.output_fingerprint,
    passed: observed === expectation,
  }];
}

function adversarialCases(): DeterministicMethodRunCase[] {
  return receivablesAdversarialRunCaseIds.map((id) => {
    const scenario = receivablesParametricScenarios.find((entry) => entry.id === id);
    if (!scenario) throw new Error(`adversarial scenario ${id} is not declared`);
    const result = underwriteReceivablesPool({currency: "BRL", case: scenario.input});
    const expectation = `${scenario.keyRisk} permanece visivel e a decisao e ${scenario.expected}`;
    const observed = `${scenario.keyRisk} permanece visivel e a decisao e ${result.state}`;
    return {
      id,
      expectation,
      observed,
      inputFingerprint: result.trace.input_fingerprint,
      outputFingerprint: result.trace.output_fingerprint,
      passed: result.state === scenario.expected && result.decision_boundary.externalDirectionAllowed === false,
    };
  });
}

function consistencyCases(): DeterministicMethodRunCase[] {
  // Both sources are declared in the schema's input form, where fields with defaults are optional.
  // Parsing yields exactly the canonical case the executor parses, so the permutations compare
  // like with like and the recorded fingerprints are the executor's own.
  const sources: Array<{label: string; input: ReceivablesCase}> = [
    {label: "gc03-aurora-2026-07", input: receivablesCaseSchema.parse(auroraGoldCase())},
    {label: "r01-clean-diversified", input: receivablesCaseSchema.parse(receivablesParametricScenarios[0]!.input)},
  ];
  return sources.flatMap(({label, input}) => {
    const canonical = underwriteReceivablesPool({currency: "BRL", case: input});
    return Array.from({length: 10}, (_unused, index) => {
      const seed = index + 1;
      const permuted = underwriteReceivablesPool({currency: "BRL", case: permute(input, seed)});
      const expectation = `permutacao ${seed} de ${label} reproduz ${canonical.trace.output_fingerprint}`;
      const observed = `permutacao ${seed} de ${label} reproduz ${permuted.trace.output_fingerprint}`;
      return {
        id: `${label}-permutation-${String(seed).padStart(2, "0")}`,
        expectation,
        observed,
        inputFingerprint: permuted.trace.input_fingerprint,
        outputFingerprint: permuted.trace.output_fingerprint,
        passed: permuted.trace.output_fingerprint === canonical.trace.output_fingerprint
          && permuted.trace.input_fingerprint === canonical.trace.input_fingerprint,
      };
    });
  });
}

export type ReceivablesMethodRunEvidence = Pick<
  DeterministicMethodRun,
  "runId" | "kind" | "method" | "executor" | "harness" | "modelCalls" | "cases" | "result"
> & {evidenceFingerprint: string; notes: string};

/** Executes the three recorded runs. Nothing here calls a model and nothing here writes files. */
export function buildReceivablesMethodRuns(): ReceivablesMethodRunEvidence[] {
  const definitions = [
    {runId: receivablesMethodRunIds.gold, kind: "gold" as const, cases: goldCases(), notes: "Gabarito congelado do Caso 03 (Aurora) executado pelo executor publicado. Os valores esperados vem do gabarito, nao do resultado."},
    {runId: receivablesMethodRunIds.adversarial, kind: "adversarial" as const, cases: adversarialCases(), notes: "Cenarios adversariais declarados no frontmatter do metodo, com a decisao esperada declarada fora do analisador."},
    {runId: receivablesMethodRunIds.consistency, kind: "consistency" as const, cases: consistencyCases(), notes: "Vinte permutacoes de linhas sobre dois casos: mesma carteira e mesma politica precisam reproduzir o mesmo fingerprint."},
  ];
  return definitions.map((definition) => {
    const evidence = {
      runId: definition.runId,
      kind: definition.kind,
      method,
      executor,
      harness,
      modelCalls: 0 as const,
      cases: definition.cases,
      result: definition.cases.every((entry) => entry.passed) ? "pass" as const : "fail" as const,
    };
    return {...evidence, evidenceFingerprint: deterministicRunEvidenceFingerprint(evidence), notes: definition.notes};
  });
}
