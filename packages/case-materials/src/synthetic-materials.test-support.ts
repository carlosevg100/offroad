import {deskEvidence, type CaseBrief, type ReadinessReport} from "@offroad/case-understanding";
import {analyzeCreditPosition, buildDeskInputs, judgeOperation, projectLeverageTrajectory, rateCredit, stressTable, type Fact} from "@offroad/credit-analysis";
import {instrumentVerdicts} from "@offroad/credit-playbook";
import {assessCapacity, buildTermSheet, designCollateralPackage} from "@offroad/deal-structure";
import {indicativePrice} from "@offroad/market-reference";
import {buildContext, computeCalculations, type ReconciledFact} from "@offroad/reconciliation";
import {syntheticCreditMaterialsCase as fixture} from "@offroad/testing-fixtures/credit-materials-case";

import {compileMaterials, financialModelMaterial, institutionalFinancialModelMaterial, type Material} from "./index";

/**
 * Compiles the synthetic Aurora case through the same functions the case engine calls, so the
 * parity pins and the section tests read what a real run publishes. Test support only.
 */

const periodOf = (fieldPath: string): string | undefined => {
  const year = fieldPath.match(/^historical_financials\.(\d{4})\./)?.[1];
  if (year) return `${year}-12-31`;
  const interim = fieldPath.match(/^interim_financials\.(\d{4})_(\d{2})\./);
  if (!interim) return undefined;
  const lastDay = new Date(Date.UTC(Number(interim[1]), Number(interim[2]), 0)).getUTCDate();
  return `${interim[1]}-${interim[2]}-${String(lastDay).padStart(2, "0")}`;
};

export function reconciledSyntheticFacts(facts: readonly Fact[]): ReconciledFact[] {
  return facts.map((fact) => {
    const periodEnd = periodOf(fact.fieldPath);
    const numeric = /^-?\d+(?:\.\d+)?$/.test(fact.value);
    return {
      key: {fieldPath: fact.fieldPath, ...(periodEnd ? {periodEnd} : {})},
      value: fact.value,
      valueType: numeric ? "number" : "text",
      accepted: {
        fieldPath: fact.fieldPath, normalizedValue: fact.value, valueType: numeric ? "number" : "text", sourceDocument: "sintetico.pdf",
        evidenceRank: 1, informationClass: "audited", confidence: 0.99, anchorVerified: true, ...(periodEnd ? {periodEnd} : {}),
      },
      conflicts: [],
      disputed: false,
    };
  });
}

const claims = [
  {id: "c1", text: "Receita líquida de R$ 191,2 milhões em 2025.", material: true, kind: "fact" as const, supportIds: ["historical_financials.2025.revenue"]},
  {id: "c2", text: "Distribuição atacadista e varejista de materiais de construção para construtoras e redes de franquia.", material: false, kind: "fact" as const, supportIds: []},
  {id: "c3", text: "A concentração de clientes é relevante para a base de recebíveis oferecida em garantia.", material: false, kind: "judgment" as const, supportIds: []},
];
const brief: CaseBrief = {
  executiveSummary: `${claims[0]!.text}\n\n${claims[1]!.text}`,
  sections: [
    {id: "history", heading: "Histórico", claims: [claims[0]!]},
    {id: "business", heading: "Negócio", claims: [claims[1]!, claims[2]!]},
    {id: "current_position", heading: "Posição atual", claims: []},
  ],
};
const readiness: ReadinessReport = {state: "in_progress", score: 0.8, components: [], blockers: []};

export type SyntheticMaterialsVariant = keyof typeof fixture.grossDebtVariants;

/** The six compiled documents, the package's workbook entry and the approved statements in the three languages of the table labels. */
export function syntheticMaterials(variant: SyntheticMaterialsVariant = "balanceAboveSchedule") {
  const facts: Fact[] = fixture.facts.map((fact) => fact.fieldPath === "historical_financials.2025.gross_debt"
    ? {fieldPath: fact.fieldPath, value: fixture.grossDebtVariants[variant]}
    : {fieldPath: fact.fieldPath, value: fact.value});
  const inputs = buildDeskInputs(facts, {referenceDate: fixture.referenceDate, indexLevels: fixture.indexLevels, statedRequest: fixture.statedRequest});
  if (!inputs.desk || !inputs.trajectory) throw new Error("synthetic desk inputs are incomplete");
  const desk = analyzeCreditPosition(inputs.desk);
  const trajectory = projectLeverageTrajectory(inputs.trajectory);
  const capacity = assessCapacity(fixture.capacity);
  const termSheet = buildTermSheet({...fixture.termSheet, capacity, blockers: []});
  const reconciled = reconciledSyntheticFacts(facts);
  const {calculations} = computeCalculations(buildContext(reconciled));
  const evidence = deskEvidence(desk, trajectory);
  const verdict = judgeOperation({desk, trajectory, operation: fixture.operation});
  const price = indicativePrice(fixture.price);
  if (!price) throw new Error("synthetic price band is missing");
  const compiled = compileMaterials({
    brief, facts: reconciled, calculations: [...calculations, ...evidence.calculations], exceptions: [], readiness,
    desk, trajectory, termSheet, companyName: fixture.companyName,
    rating: rateCredit({desk, trajectory, ...fixture.rating}),
    stress: stressTable({desk, ...fixture.stress}),
    instruments: instrumentVerdicts({...fixture.instruments, archetypeId: fixture.capacity.archetypeId}),
    collateral: designCollateralPackage(fixture.collateral),
    price,
    verdict,
  });
  if (!compiled.ok) throw new Error(`synthetic materials refused: ${compiled.reason} ${compiled.detail.join("; ")}`);
  const scenario = {name: fixture.institutionalScenario.name, currency: fixture.institutionalScenario.currency, periods: fixture.institutionalScenario.periods};
  const statements = (lang?: "pt" | "en"): Material => institutionalFinancialModelMaterial({
    artifactFingerprint: "6".repeat(64), supportIds: ["synthetic-approved-review"], ...(lang ? {lang} : {}), scenarios: [scenario],
  });
  return {
    materials: compiled.materials,
    workbookEntry: financialModelMaterial(fixture.financialModel),
    statements: {bilingual: statements(), pt: statements("pt"), en: statements("en")},
    desk,
    trajectory,
    facts: reconciled,
  };
}
