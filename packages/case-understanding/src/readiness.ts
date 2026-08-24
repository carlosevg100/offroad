import Decimal from "decimal.js";
import {
  assessSufficiency,
  fieldsForRequirement,
  requirementIsSatisfied,
  type ArchetypeId,
  type ClassifiedDocument,
  type InformationAnswers,
  type MaterialFieldRequirement,
  type RequirementResponses,
} from "@offroad/credit-playbook";
import type {InformationGap, ReconciledFact, ReconciliationException} from "@offroad/reconciliation";

/**
 * How ready this case is to be shown to an investor — computed, never scored by a model.
 *
 * A single number would be worse than useless here: a company told "68%" learns nothing it can
 * act on, and an analyst told "68%" cannot defend it. So readiness is five components, each
 * one a fraction with its own arithmetic and its own sentence, and the overall figure is only
 * their weighted sum — always shown next to the parts, never instead of them.
 *
 * The components are the five questions a desk actually asks before circulating anything:
 * do we have the documents, do the numbers agree, how good is the evidence behind them, is
 * anything material still unknown, and is there something that stops this outright.
 *
 * **Blockers are not a low score.** A critical open exception or a missing minimum document
 * does not shave points off — it holds the case at `blocked`, whatever the other components
 * say. A package that is 90% complete and has a balance sheet that does not balance is not
 * 90% ready; it is not ready.
 */

export type ReadinessComponentId =
  | "data_sufficiency"
  | "reconciliation"
  | "evidence_quality"
  | "material_gaps"
  | "blockers";

export type ReadinessComponent = {
  id: ReadinessComponentId;
  /** 0 to 1. */
  score: number;
  weight: number;
  labels: {pt: string; en: string};
  /** Why it landed where it landed, in numbers the reader can check. */
  explanation: {pt: string; en: string};
};

export type ReadinessReport = {
  /** `blocked` overrides everything below it; the score still shows, so progress is visible. */
  state: "blocked" | "in_progress" | "ready";
  /** Weighted sum of the components, 0 to 1. Never shown without them. */
  score: number;
  components: ReadinessComponent[];
  /** What holds the case, each one nameable and fixable. */
  blockers: Array<{id: string; labels: {pt: string; en: string}}>;
};

export type ReadinessInput = {
  archetypeId: ArchetypeId;
  documents: readonly ClassifiedDocument[];
  facts: readonly ReconciledFact[];
  exceptions: readonly ReconciliationException[];
  gaps: readonly InformationGap[];
  /** Economic requirements and the alternative canonical paths that can discharge each one. */
  expectedMaterialFields: readonly (string | MaterialFieldRequirement)[];
  informationAnswers?: InformationAnswers;
  requirementResponses?: RequirementResponses;
  /** Values declared in the guided intake may satisfy a requirement before a document states it. */
  additionalAvailableFieldPaths?: readonly string[];
};

const WEIGHTS: Record<ReadinessComponentId, number> = {
  data_sufficiency: 0.3,
  reconciliation: 0.25,
  evidence_quality: 0.2,
  material_gaps: 0.15,
  blockers: 0.1,
};

const ratio = (numerator: number, denominator: number) =>
  denominator === 0 ? 1 : Number(new Decimal(numerator).div(denominator).toDecimalPlaces(4).toFixed());

export function assessReadiness(input: ReadinessInput): ReadinessReport {
  const sufficiency = assessSufficiency(
    input.archetypeId,
    input.documents,
    input.informationAnswers,
    input.requirementResponses,
  );
  const requirements = input.expectedMaterialFields.map((entry) =>
    typeof entry === "string" ? {id: entry, anyOf: [entry]} : entry,
  );

  // 1 — do we have the documents? The minimum weighs double: it is the refusal line.
  const minimumScore = ratio(sufficiency.minimum.satisfied, sufficiency.minimum.total);
  const idealScore = ratio(sufficiency.ideal.satisfied, sufficiency.ideal.total);
  const dataSufficiency = Number(new Decimal(minimumScore).times(2).plus(idealScore).div(3).toDecimalPlaces(4).toFixed());

  // 2 — do the numbers agree? Severity-weighted, because one critical outweighs many lows.
  const severityCost: Record<string, number> = {critical: 1, high: 0.5, medium: 0.2, low: 0.05};
  const reconciliationCost = input.exceptions.reduce((sum, exception) => sum + (severityCost[exception.severity] ?? 0.2), 0);
  const reconciliation = Math.max(0, Number(new Decimal(1).minus(new Decimal(reconciliationCost).div(4)).toDecimalPlaces(4).toFixed()));

  // 3 — how good is the evidence? Rank 1 is audited, 7 is the company saying so; a verified
  // anchor is what separates a fact from a plausible sentence.
  const materialFacts = requirements.flatMap((requirement) => fieldsForRequirement(requirement, input.facts));
  const scored = materialFacts.length > 0 ? materialFacts : input.facts;
  const averageRank = scored.length === 0 ? 7 : scored.reduce((sum, fact) => sum + fact.accepted.evidenceRank, 0) / scored.length;
  const verifiedShare = scored.length === 0 ? 0 : scored.filter((fact) => fact.accepted.anchorVerified).length / scored.length;
  const rankScore = Math.max(0, (7 - averageRank) / 6);
  const evidenceQuality = Number(new Decimal(rankScore).times(0.5).plus(new Decimal(verifiedShare).times(0.5)).toDecimalPlaces(4).toFixed());

  // 4 — is anything material still unknown?
  const presentMaterial = new Set([
    ...input.facts.map((fact) => fact.key.fieldPath),
    ...(input.additionalAvailableFieldPaths ?? []),
  ]);
  const missingMaterial = requirements.filter((requirement) => !requirementIsSatisfied(requirement, presentMaterial));
  const materialGaps = ratio(requirements.length - missingMaterial.length, requirements.length);

  // 5 — is there something that stops this outright?
  const criticalExceptions = input.exceptions.filter((exception) => exception.severity === "critical");
  const blockers: ReadinessReport["blockers"] = [
    ...criticalExceptions.map((exception) => ({
      id: `exception:${exception.ruleId}`,
      labels: {pt: exception.title, en: exception.title},
    })),
    ...(sufficiency.minimum.complete
      ? []
      : [
          {
            id: "minimum_documents",
            labels: {
              pt: `Faltam ${sufficiency.minimum.total - sufficiency.minimum.satisfied} documento(s) do mínimo`,
              en: `${sufficiency.minimum.total - sufficiency.minimum.satisfied} minimum document(s) missing`,
            },
          },
        ]),
  ];
  const blockerScore = blockers.length === 0 ? 1 : 0;

  const components: ReadinessComponent[] = [
    {
      id: "data_sufficiency",
      score: dataSufficiency,
      weight: WEIGHTS.data_sufficiency,
      labels: {pt: "Suficiência de dados", en: "Data sufficiency"},
      explanation: {
        pt: `Mínimo ${sufficiency.minimum.satisfied}/${sufficiency.minimum.total}, ideal ${sufficiency.ideal.satisfied}/${sufficiency.ideal.total}. O mínimo pesa o dobro porque é a linha de recusa.`,
        en: `Minimum ${sufficiency.minimum.satisfied}/${sufficiency.minimum.total}, ideal ${sufficiency.ideal.satisfied}/${sufficiency.ideal.total}. The minimum weighs double because it is the refusal line.`,
      },
    },
    {
      id: "reconciliation",
      score: reconciliation,
      weight: WEIGHTS.reconciliation,
      labels: {pt: "Estado da conciliação", en: "Reconciliation status"},
      explanation: {
        pt: `${input.exceptions.length} exceção(ões) aberta(s), ponderadas por severidade (${criticalExceptions.length} crítica(s)).`,
        en: `${input.exceptions.length} open exception(s), weighted by severity (${criticalExceptions.length} critical).`,
      },
    },
    {
      id: "evidence_quality",
      score: evidenceQuality,
      weight: WEIGHTS.evidence_quality,
      labels: {pt: "Qualidade da evidência", en: "Evidence quality"},
      explanation: {
        pt: `Rank médio ${averageRank.toFixed(1)} de 7 (1 é auditado) e ${Math.round(verifiedShare * 100)}% dos fatos com âncora confirmada.`,
        en: `Average rank ${averageRank.toFixed(1)} of 7 (1 is audited) and ${Math.round(verifiedShare * 100)}% of facts with a confirmed anchor.`,
      },
    },
    {
      id: "material_gaps",
      score: materialGaps,
      weight: WEIGHTS.material_gaps,
      labels: {pt: "Lacunas materiais", en: "Material gaps"},
      explanation: {
        pt: `${missingMaterial.length} de ${requirements.length} requisitos materiais ainda sem evidência ou resposta de intake.`,
        en: `${missingMaterial.length} of ${requirements.length} material requirements still lack evidence or an intake answer.`,
      },
    },
    {
      id: "blockers",
      score: blockerScore,
      weight: WEIGHTS.blockers,
      labels: {pt: "Bloqueios", en: "Blockers"},
      explanation:
        blockers.length === 0
          ? {
              pt: "Nenhum bloqueio aberto: nada impede este caso de circular.",
              en: "No open blockers: nothing stops this case from circulating.",
            }
          : {
              pt: `${blockers.length} bloqueio(s): o caso não circula enquanto estiverem abertos.`,
              en: `${blockers.length} blocker(s): the case does not circulate while they are open.`,
            },
    },
  ];

  const score = Number(
    components
      .reduce((sum, component) => sum.plus(new Decimal(component.score).times(component.weight)), new Decimal(0))
      .toDecimalPlaces(4)
      .toFixed(),
  );

  // A blocker holds the case regardless of the score. 90% complete with a balance sheet that
  // does not balance is not 90% ready.
  const state: ReadinessReport["state"] = blockers.length > 0 ? "blocked" : score >= 0.85 ? "ready" : "in_progress";

  return {state, score, components, blockers};
}
