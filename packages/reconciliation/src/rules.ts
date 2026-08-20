import Decimal from "decimal.js";
import {reconciliationRule, type ExceptionSeverity} from "@offroad/credit-ontology";

import {factValue, indexFacts, relativeDelta, type ReconciledFact} from "./facts";

/**
 * The rules the desk runs before it believes a number.
 *
 * Each one is arithmetic or a comparison over reconciled facts — never a model call, never a
 * judgement. That is deliberate: an exception is the moment the system tells a company that
 * something in its data room does not add up, and it has to be able to show the two sides and
 * the difference, not an opinion. R1–R17 are declared in the ontology with their tolerance,
 * severity and rationale; this file is the arithmetic that discharges them.
 *
 * An exception is a **question**, not a verdict. Every one carries both sides with their
 * source documents, so the reviewer sees "the audited statements say 65, the debt schedule
 * says 68, as of different dates" and can resolve it — rather than a red badge saying "debt
 * mismatch".
 */

export type ExceptionEvidence = {
  label: string;
  value?: string;
  sourceDocument?: string;
  fieldPath?: string;
  anchor?: unknown;
};

export type ReconciliationException = {
  ruleId: string;
  type: string;
  severity: ExceptionSeverity;
  title: string;
  description: string;
  /** Both sides of the difference, so the reviewer can judge instead of trusting. */
  evidence: ExceptionEvidence[];
  /** Who has to answer: the company, or the analyst. */
  ownerRole: string;
  blocksExternalOutputs: boolean;
};

export type RuleContext = {
  facts: readonly ReconciledFact[];
  index: Map<string, ReconciledFact>;
  /** Period ends present in the fact set, most recent first. */
  periods: string[];
  locale: "pt" | "en";
};

export function buildContext(facts: readonly ReconciledFact[], locale: "pt" | "en" = "pt"): RuleContext {
  const periods = [...new Set(facts.map((fact) => fact.key.periodEnd).filter((p): p is string => Boolean(p)))].sort().reverse();
  return {facts, index: indexFacts(facts), periods, locale};
}

const money = (value: Decimal) =>
  `R$ ${value.toDecimalPlaces(0).toFixed().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

function exceptionFrom(
  ruleId: string,
  severity: ExceptionSeverity | undefined,
  description: {pt: string; en: string},
  evidence: ExceptionEvidence[],
  locale: "pt" | "en",
): ReconciliationException {
  const rule = reconciliationRule(ruleId);
  return {
    ruleId,
    type: rule.type,
    severity: severity ?? rule.defaultSeverity,
    title: rule.titles[locale],
    description: description[locale],
    evidence,
    ownerRole: rule.ownerRole,
    blocksExternalOutputs: rule.blocksExternalOutputsWhenCritical && (severity ?? rule.defaultSeverity) === "critical",
  };
}

/** R4 — the debt balance has to be the same number wherever it is written. */
function ruleDebtConsistency(context: RuleContext): ReconciliationException[] {
  const fact = context.index.get("debt.total_gross");
  if (!fact || fact.conflicts.length === 0 || !fact.disputed) return [];

  const worst = [...fact.conflicts].sort((a, b) => Number(b.relativeDelta ?? 0) - Number(a.relativeDelta ?? 0))[0];
  if (!worst) return [];

  const accepted = new Decimal(fact.value);
  const other = new Decimal(worst.candidate.normalizedValue);
  return [
    exceptionFrom(
      "R4",
      "medium",
      {
        pt: `O saldo de dívida aparece como ${money(accepted)} em ${fact.accepted.sourceDocument} e ${money(other)} em ${worst.candidate.sourceDocument}. Diferenças assim costumam ser datas-base distintas — o que precisa ser confirmado antes de a capacidade incremental ser calculada.`,
        en: `Total debt appears as ${money(accepted)} in ${fact.accepted.sourceDocument} and ${money(other)} in ${worst.candidate.sourceDocument}. Differences like this are usually different reference dates, which has to be confirmed before incremental capacity is calculated.`,
      },
      [
        {label: "aceito", value: fact.value, sourceDocument: fact.accepted.sourceDocument, fieldPath: "debt.total_gross", anchor: fact.accepted.anchor},
        {label: "conflito", value: worst.candidate.normalizedValue, sourceDocument: worst.candidate.sourceDocument, fieldPath: "debt.total_gross", anchor: worst.candidate.anchor},
      ],
      context.locale,
    ),
  ];
}

/** R11 — sources equal uses, and the request equals what it is for. */
function ruleSourcesAndUses(context: RuleContext): ReconciliationException[] {
  const side = (which: string) =>
    context.facts
      .filter((fact) => /^transaction\.sources_and_uses\.\d+\.side$/.test(fact.key.fieldPath) && fact.value === which)
      .map((fact) => fact.key.fieldPath.replace(/\.side$/, ".amount"))
      .map((path) => context.index.get(path))
      .filter((fact): fact is ReconciledFact => Boolean(fact) && fact!.valueType === "number")
      .reduce((sum, fact) => sum.plus(new Decimal(fact.value)), new Decimal(0));

  const sources = side("sources");
  const uses = side("uses");
  const exceptions: ReconciliationException[] = [];

  if (sources.gt(0) && uses.gt(0)) {
    const delta = relativeDelta(sources.toFixed(), uses.toFixed());
    if (delta !== null && new Decimal(delta).gt("0.01")) {
      exceptions.push(
        exceptionFrom(
          "R11",
          "high",
          {
            pt: `Fontes somam ${money(sources)} e usos somam ${money(uses)}. Um quadro de fontes e usos que não fecha indica pedido mal dimensionado ou uma destinação não declarada.`,
            en: `Sources total ${money(sources)} and uses total ${money(uses)}. A sources and uses table that does not tie indicates a mis-sized request or an undeclared application.`,
          },
          [
            {label: "fontes", value: sources.toFixed()},
            {label: "usos", value: uses.toFixed()},
          ],
          context.locale,
        ),
      );
    }
  }

  // The project's stated cost against what the uses say is going into it.
  const projectCost = factValue(context.index, "project.total_cost");
  if (projectCost && uses.gt(0)) {
    const delta = relativeDelta(projectCost.toFixed(), uses.toFixed());
    if (delta !== null && new Decimal(delta).gt("0.005") && new Decimal(delta).lte("0.05")) {
      exceptions.push(
        exceptionFrom(
          "R11",
          "low",
          {
            pt: `O custo do projeto está declarado como ${money(projectCost)}, enquanto os usos somam ${money(uses)}. A diferença é pequena e costuma ser arredondamento na apresentação — vale confirmar qual número entra no term sheet.`,
            en: `Project cost is stated as ${money(projectCost)} while uses total ${money(uses)}. The difference is small and usually presentation rounding — worth confirming which number goes into the term sheet.`,
          },
          [
            {label: "custo do projeto", value: projectCost.toFixed(), fieldPath: "project.total_cost"},
            {label: "soma dos usos", value: uses.toFixed()},
          ],
          context.locale,
        ),
      );
    }
  }

  return exceptions;
}

/** R16 — a number the auditor did not sign is a different kind of number. */
function ruleInformationClass(context: RuleContext): ReconciliationException[] {
  const latest = context.periods[0];
  if (!latest) return [];

  const material = context.facts.filter(
    (fact) => fact.key.periodEnd === latest && /^(historical|interim)_financials\./.test(fact.key.fieldPath),
  );
  if (material.length === 0) return [];

  const unaudited = material.filter((fact) => fact.accepted.informationClass !== "audited");
  if (unaudited.length < material.length * 0.5) return [];

  const source = unaudited[0]?.accepted.sourceDocument;
  return [
    exceptionFrom(
      "R16",
      "medium",
      {
        pt: `Os números do período mais recente (${latest}) vêm de fonte não auditada — revisão limitada ou material gerencial. Continuam utilizáveis, e o investidor precisa saber disso ao ler a alavancagem atual.`,
        en: `The most recent period (${latest}) is sourced from unaudited material — limited review or management reporting. Still usable, and the investor has to know it when reading current leverage.`,
      },
      [
        {label: "período", value: latest},
        {label: "classe da informação", value: unaudited[0]?.accepted.informationClass ?? "unknown", ...(source ? {sourceDocument: source} : {})},
        {label: "campos afetados", value: String(unaudited.length)},
      ],
      context.locale,
    ),
  ];
}

/** R14 — thousands read as units is the most expensive and most common error there is. */
function ruleScaleSanity(context: RuleContext): ReconciliationException[] {
  const exceptions: ReconciliationException[] = [];
  for (const period of context.periods) {
    const revenue = factValue(context.index, `historical_financials.${period.slice(0, 4)}.revenue`, period);
    const ebitda = factValue(context.index, `historical_financials.${period.slice(0, 4)}.ebitda`, period);
    if (!revenue || !ebitda || revenue.lte(0)) continue;

    const margin = ebitda.div(revenue);
    // A margin above 100% or below −100% is not a business, it is a scale error.
    if (margin.abs().gt(1)) {
      exceptions.push(
        exceptionFrom(
          "R14",
          "critical",
          {
            pt: `A margem EBITDA calculada para ${period} é de ${margin.times(100).toDecimalPlaces(0).toFixed()}%, o que não descreve uma operação — descreve escalas diferentes entre as duas linhas (uma em milhares e a outra em unidades, tipicamente).`,
            en: `The EBITDA margin computed for ${period} is ${margin.times(100).toDecimalPlaces(0).toFixed()}%, which does not describe a business — it describes two lines read at different scales, typically thousands against units.`,
          },
          [
            {label: "receita", value: revenue.toFixed()},
            {label: "ebitda", value: ebitda.toFixed()},
            {label: "período", value: period},
          ],
          context.locale,
        ),
      );
    }
  }
  return exceptions;
}

/** R13 — an interim figure larger than the full year is a period or a scale error. */
function rulePeriodSanity(context: RuleContext): ReconciliationException[] {
  const exceptions: ReconciliationException[] = [];
  for (const fact of context.facts) {
    const match = /^interim_financials\.(\d{4})_\d+\.([a-z_]+?)(?:_\d+m|_ytd|_ltm)?$/.exec(fact.key.fieldPath);
    if (!match || fact.valueType !== "number") continue;
    const [, year, metric] = match as unknown as [string, string, string];
    const annual = factValue(context.index, `historical_financials.${Number(year) - 1}.${metric}`);
    if (!annual || annual.lte(0)) continue;

    const interim = new Decimal(fact.value);
    if (interim.gt(annual.times(1.5))) {
      exceptions.push(
        exceptionFrom(
          "R13",
          "medium",
          {
            pt: `O acumulado do ano para ${metric} (${money(interim)}) supera em mais de 50% o exercício de ${Number(year) - 1} inteiro (${money(annual)}). Ou o crescimento é excepcional e precisa de explicação, ou há erro de período ou de escala.`,
            en: `Year-to-date ${metric} (${money(interim)}) exceeds the whole of ${Number(year) - 1} (${money(annual)}) by more than 50%. Either growth is exceptional and needs explaining, or there is a period or scale error.`,
          },
          [
            {label: "acumulado", value: fact.value, fieldPath: fact.key.fieldPath, sourceDocument: fact.accepted.sourceDocument},
            {label: "exercício anterior", value: annual.toFixed()},
          ],
          context.locale,
        ),
      );
    }
  }
  return exceptions;
}

/** R3 — the same metric from different sources has to agree, or the difference is the story. */
function ruleSourceConflict(context: RuleContext): ReconciliationException[] {
  const watched = /(\.revenue|\.ebitda|\.net_income|\.equity|\.total_assets)$/;
  return context.facts
    .filter((fact) => fact.disputed && watched.test(fact.key.fieldPath) && fact.conflicts.length > 0)
    .slice(0, 8)
    .map((fact) => {
      const worst = [...fact.conflicts].sort((a, b) => Number(b.relativeDelta ?? 0) - Number(a.relativeDelta ?? 0))[0]!;
      const pct = worst.relativeDelta ? new Decimal(worst.relativeDelta).times(100).toDecimalPlaces(1).toFixed() : "?";
      return exceptionFrom(
        "R3",
        "high",
        {
          pt: `${fact.key.fieldPath}${fact.key.periodEnd ? ` (${fact.key.periodEnd})` : ""} difere em ${pct}% entre ${fact.accepted.sourceDocument} e ${worst.candidate.sourceDocument}. Foi adotado o de maior rank de evidência; a diferença precisa de explicação antes de ir ao mercado.`,
          en: `${fact.key.fieldPath}${fact.key.periodEnd ? ` (${fact.key.periodEnd})` : ""} differs by ${pct}% between ${fact.accepted.sourceDocument} and ${worst.candidate.sourceDocument}. The higher evidence rank was adopted; the difference needs explaining before this goes to market.`,
        },
        [
          {label: "adotado", value: fact.value, sourceDocument: fact.accepted.sourceDocument, fieldPath: fact.key.fieldPath, anchor: fact.accepted.anchor},
          {label: "conflito", value: worst.candidate.normalizedValue, sourceDocument: worst.candidate.sourceDocument, anchor: worst.candidate.anchor},
        ],
        context.locale,
      );
    });
}

/** R5 — financial expense has to look like the debt stock times a plausible rate. */
function ruleFinancialExpensePlausibility(context: RuleContext): ReconciliationException[] {
  const period = context.periods[0];
  if (!period) return [];
  const year = period.slice(0, 4);
  const expense = factValue(context.index, `historical_financials.${year}.financial_expenses`, period);
  const debt = factValue(context.index, "debt.total_gross");
  if (!expense || !debt || debt.lte(0)) return [];

  const impliedRate = expense.abs().div(debt);
  // Outside 3%–40% a year, either debt is unmapped or the rate is not what it seems.
  if (impliedRate.gte("0.03") && impliedRate.lte("0.40")) return [];

  return [
    exceptionFrom(
      "R5",
      "medium",
      {
        pt: `A despesa financeira do período implica uma taxa de ${impliedRate.times(100).toDecimalPlaces(1).toFixed()}% sobre a dívida mapeada. Fora da faixa plausível, isso costuma significar dívida não mapeada, subsídio, ou despesa que inclui itens não financeiros.`,
        en: `The period's financial expense implies a ${impliedRate.times(100).toDecimalPlaces(1).toFixed()}% rate on mapped debt. Outside the plausible range this usually means unmapped debt, a subsidy, or an expense line that includes non-financial items.`,
      },
      [
        {label: "despesa financeira", value: expense.toFixed()},
        {label: "dívida mapeada", value: debt.toFixed()},
        {label: "taxa implícita", value: impliedRate.toDecimalPlaces(4).toFixed()},
      ],
      context.locale,
    ),
  ];
}

const allRules = [
  ruleDebtConsistency,
  ruleSourcesAndUses,
  ruleInformationClass,
  ruleScaleSanity,
  rulePeriodSanity,
  ruleSourceConflict,
  ruleFinancialExpensePlausibility,
];

/** Runs every rule over the reconciled facts. Deterministic, ordered by severity. */
export function runRules(context: RuleContext): ReconciliationException[] {
  const order: Record<ExceptionSeverity, number> = {critical: 0, high: 1, medium: 2, low: 3};
  return allRules
    .flatMap((rule) => rule(context))
    .sort((a, b) => order[a.severity] - order[b.severity]);
}
