import Decimal from "decimal.js";
import {auditBrief, type CaseBrief, type ReadinessReport} from "@offroad/case-understanding";
import type {DeskAnalysis, OperationVerdict, Trajectory} from "@offroad/credit-analysis";

import {capitalStructure, covenantSchedule, riskFactors, sourcesAndUses, trajectoryTable} from "./desk-sections";
import type {InternalRating, StressScenario} from "@offroad/credit-analysis";
import type {InstrumentVerdict} from "@offroad/credit-playbook";
import type {CollateralPackage} from "@offroad/deal-structure";
import type {IndicativePrice} from "@offroad/market-reference";

import {diligenceQa} from "./diligence";
import {creditMemo, termSheetDocument} from "./institutional";
import type {IndicativeTermSheet} from "@offroad/deal-structure";
import type {ReconciledFact, ReconciliationException, TracedCalculation} from "@offroad/reconciliation";

/**
 * The documents a company takes to market, assembled from what was verified.
 *
 * Three of them, because a debt process has three moments and they need different documents:
 *
 *   - **Teaser**, one page, no company name until the company says so, enough for an investor
 *     to decide whether to sign an NDA.
 *   - **Credit profile**, the analysis: history, current position, the operation, the numbers
 *     with their sources, the open questions.
 *   - **Package**, the profile plus the indicative structure and the diligence roadmap.
 *
 * Every one is compiled, never written free-hand: sections are assembled from facts,
 * calculations, the brief's claims and the term sheet, and the same evidence auditor that gates
 * the brief gates the material. A document that would carry a number nobody can source does not
 * get produced, and a critical open exception blocks all three, because circulating a case
 * whose balance sheet does not balance is worse than circulating nothing.
 *
 * The two languages carry identical economics by construction: numbers are formatted from the
 * same decimal strings, never translated or re-rounded per locale.
 */

export type MaterialKind = "teaser" | "credit_profile" | "package" | "credit_memo" | "term_sheet" | "diligence_qa" | "data_room_index";

export type MaterialBlock =
  | {type: "heading"; text: {pt: string; en: string}}
  | {type: "paragraph"; text: {pt: string; en: string}; claimId?: string; supportIds?: string[]}
  | {type: "metrics"; items: Array<{label: {pt: string; en: string}; value: string; formatted: {pt: string; en: string}; supportIds: string[]}>}
  | {type: "table"; caption: {pt: string; en: string}; head: Array<{pt: string; en: string}>; rows: string[][]}
  | {type: "list"; items: Array<{pt: string; en: string}>}
  | {type: "disclaimer"; text: {pt: string; en: string}}
  /** Two-column terms a lawyer can mark up: label, value, and the basis beside it. */
  | {type: "kv"; caption?: {pt: string; en: string}; rows: Array<{label: {pt: string; en: string}; value: {pt: string; en: string}; note?: {pt: string; en: string}; supportIds?: string[]}>}
  /** A boxed card of labelled values: key terms at the top, basis of preparation at the end. */
  | {type: "callout"; title: {pt: string; en: string}; items: Array<{label: {pt: string; en: string}; value: {pt: string; en: string}}>};

export type Material = {
  kind: MaterialKind;
  title: {pt: string; en: string};
  blocks: MaterialBlock[];
  /** Facts and calculations this document depends on, for staleness detection. */
  dependsOn: string[];
};

export type CompileInput = {
  brief: CaseBrief;
  facts: readonly ReconciledFact[];
  calculations: readonly TracedCalculation[];
  exceptions: readonly ReconciliationException[];
  termSheet?: IndicativeTermSheet;
  readiness: ReadinessReport;
  /** Redacted until the company authorises disclosure (AGENTS.md §2.6). */
  companyName?: string;
  currency?: string;
  /** The desk battery and the structure. Without them the package is a brochure. */
  desk?: DeskAnalysis | null;
  trajectory?: Trajectory | null;
  /** The committee pack: grade, shocks, papers, security. */
  rating?: InternalRating;
  stress?: StressScenario[];
  instruments?: InstrumentVerdict[];
  collateral?: CollateralPackage;
  price?: IndicativePrice;
  /** The judgement on the operation; leads the memorandum when present. */
  verdict?: OperationVerdict;
  /** Current human approvals, matched to the exact claim fingerprint upstream. */
  approvedJudgmentIds?: readonly string[];
};

export type CompileOutcome =
  | {ok: true; materials: Material[]}
  | {ok: false; reason: "blocked_by_exception" | "audit_failed" | "not_ready"; detail: string[]};

const formatMoney = (value: string, currency: string, locale: "pt-BR" | "en-US") => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  return `${currency} ${parsed.toLocaleString(locale, {maximumFractionDigits: 0})}`;
};

const formatMultiple = (value: string, locale: "pt-BR" | "en-US") => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${parsed.toLocaleString(locale, {minimumFractionDigits: 2, maximumFractionDigits: 2})}x` : value;
};

/** Calculations that read as multiples rather than money. */
const MULTIPLES = new Set(["leverage_pre_transaction", "leverage_post_transaction"]);

function metricsFrom(calculations: readonly TracedCalculation[], currency: string): MaterialBlock | null {
  const wanted = ["adjusted_ebitda", "net_debt", "leverage_pre_transaction", "leverage_post_transaction", "collateral_capacity_total"];
  const items = wanted
    .map((id) => calculations.find((calculation) => calculation.id === id))
    .filter((calculation): calculation is TracedCalculation => Boolean(calculation))
    .map((calculation) => ({
      label: calculation.labels,
      value: calculation.value,
      formatted: MULTIPLES.has(calculation.id)
        ? {pt: formatMultiple(calculation.value, "pt-BR"), en: formatMultiple(calculation.value, "en-US")}
        : {pt: formatMoney(calculation.value, currency, "pt-BR"), en: formatMoney(calculation.value, currency, "en-US")},
      // The metric points at the calculation, which points at its inputs, which point at the
      // documents. That chain is the whole product.
      supportIds: [calculation.id, ...calculation.inputs],
    }));

  return items.length > 0 ? {type: "metrics", items} : null;
}

/** History as the investor wants it: one row per period, sources kept alongside. */
function historyTable(facts: readonly ReconciledFact[], currency: string): MaterialBlock | null {
  const metrics = ["revenue", "ebitda", "net_income"];
  const periods = [...new Set(facts.map((fact) => fact.key.periodEnd).filter((period): period is string => Boolean(period)))].sort();
  if (periods.length === 0) return null;

  const rows = periods.map((period) => {
    const year = period.slice(0, 4);
    const cells = metrics.map((metric) => {
      const fact = facts.find((candidate) => candidate.key.periodEnd === period && candidate.key.fieldPath.endsWith(`.${metric}`));
      return fact ? formatMoney(fact.value, currency, "pt-BR") : "não informado";
    });
    return [year, ...cells];
  });

  return {
    type: "table",
    caption: {pt: "Histórico", en: "History"},
    head: [
      {pt: "Período", en: "Period"},
      {pt: "Receita líquida", en: "Net revenue"},
      {pt: "EBITDA", en: "EBITDA"},
      {pt: "Lucro líquido", en: "Net income"},
    ],
    rows,
  };
}

const DISCLAIMER: MaterialBlock = {
  type: "disclaimer",
  text: {
    pt: "Material preparado pela Offroad Capital, na qualidade de assessora de DCM, a partir de informações fornecidas pela companhia, conciliadas e rastreadas até o documento de origem. As análises e estruturas são indicativas e não constituem parecer de crédito vinculante, oferta, recomendação de investimento, compromisso de crédito ou garantia de captação. Cada financiador realiza seu próprio underwriting, diligência, comitê, negociação de termos e documentação definitiva.",
    en: "Material prepared by Offroad Capital, acting as DCM adviser, from information provided by the company, reconciled and traced to its source document. Analyses and structures are indicative and do not constitute a binding credit opinion, offer, investment recommendation, credit commitment or funding assurance. Each capital provider performs its own underwriting, diligence, committee review, term negotiation and definitive documentation.",
  },
};

/**
 * Assembles the three documents, or explains why it will not.
 *
 * Refusal comes first and is deliberate. A critical open exception blocks everything, a case
 * whose numbers do not reconcile should not reach an investor with a nice cover, and a brief
 * that fails the evidence audit cannot be quoted from, because its sentences are exactly what
 * would be quoted.
 */
export function compileMaterials(input: CompileInput): CompileOutcome {
  const currency = input.currency ?? "R$";

  const blocking = input.exceptions.filter((exception) => exception.blocksExternalOutputs);
  if (blocking.length > 0) {
    return {
      ok: false,
      reason: "blocked_by_exception",
      detail: blocking.map((exception) => `${exception.ruleId}: ${exception.title}`),
    };
  }

  const audit = auditBrief({
    brief: input.brief,
    facts: input.facts,
    calculations: input.calculations,
    ...(input.approvedJudgmentIds ? {approvedJudgmentIds: input.approvedJudgmentIds} : {}),
  });
  if (!audit.ok) {
    return {ok: false, reason: "audit_failed", detail: audit.audit.findings.map((finding) => `${finding.claimId}: ${finding.reason} · ${finding.detail}`)};
  }

  const name = input.companyName ?? "";
  // Without authorisation the teaser carries a description, never an identity: a private
  // workspace is not a discovery surface (AGENTS.md §2.6).
  const anonymous = !input.companyName;

  const metrics = metricsFrom(input.calculations, currency);
  const history = historyTable(input.facts, currency);
  const summary: MaterialBlock = {type: "paragraph", text: {pt: input.brief.executiveSummary, en: input.brief.executiveSummary}};

  const teaser: Material = {
    kind: "teaser",
    title: {
      pt: anonymous ? "Oportunidade de crédito privado" : `${name}: oportunidade de crédito privado`,
      en: anonymous ? "Private credit opportunity" : `${name}: private credit opportunity`,
    },
    blocks: [
      {type: "heading", text: {pt: "A oportunidade", en: "The opportunity"}},
      summary,
      ...(metrics ? [metrics] : []),
      DISCLAIMER,
    ],
    dependsOn: input.calculations.map((calculation) => calculation.id),
  };

  const profileBlocks: MaterialBlock[] = [
    {type: "heading", text: {pt: "Resumo executivo", en: "Executive summary"}},
    summary,
  ];

  for (const section of input.brief.sections) {
    if (section.id === "executive_summary") continue;
    profileBlocks.push({type: "heading", text: {pt: section.heading, en: section.heading}});
    for (const claim of section.claims) {
      profileBlocks.push({
        type: "paragraph",
        text: {pt: claim.text, en: claim.text},
        claimId: claim.id,
        ...(claim.supportIds.length > 0 ? {supportIds: claim.supportIds} : {}),
      });
    }
    if (section.id === "history" && history) profileBlocks.push(history);
    if (section.id === "current_position" && metrics) profileBlocks.push(metrics);
  }

  // The desk sections: the capital structure the day before and after, and the risks with
  // their structural answers. This is the difference between a brochure and a document an
  // investor prices from.
  if (input.desk) {
    profileBlocks.push({type: "heading", text: {pt: "Estrutura de capital e tratamento", en: "Capital structure and treatment"}});
    profileBlocks.push(...capitalStructure(input.desk, input.trajectory ?? null));
    profileBlocks.push(...riskFactors(input.desk, input.trajectory ?? null));
  }

  // Open questions belong in the document. An investor who finds them himself trusts the
  // package less than one who was handed them.
  if (input.exceptions.length > 0) {
    profileBlocks.push({type: "heading", text: {pt: "Pontos em aberto", en: "Open points"}});
    profileBlocks.push({
      type: "list",
      items: input.exceptions.map((exception) => ({pt: exception.description, en: exception.description})),
    });
  }
  profileBlocks.push(DISCLAIMER);

  const creditProfile: Material = {
    kind: "credit_profile",
    title: {
      pt: anonymous ? "Perfil de crédito" : `${name}: perfil de crédito`,
      en: anonymous ? "Credit profile" : `${name}: credit profile`,
    },
    blocks: profileBlocks,
    dependsOn: [...input.calculations.map((calculation) => calculation.id), ...input.facts.map((fact) => fact.key.fieldPath)],
  };

  const packageBlocks = [...profileBlocks];
  if (input.desk && input.trajectory) {
    const su = sourcesAndUses(input.desk, input.trajectory);
    const insert: MaterialBlock[] = [
      {type: "heading", text: {pt: "A operação proposta", en: "The proposed transaction"}},
      ...(su ? [su] : []),
      trajectoryTable(input.trajectory),
      covenantSchedule(input.trajectory),
    ];
    packageBlocks.splice(packageBlocks.length - 1, 0, ...insert);
  }
  if (input.termSheet) {
    packageBlocks.splice(packageBlocks.length - 1, 0, {type: "heading", text: {pt: "Estrutura indicativa", en: "Indicative structure"}});
    packageBlocks.splice(packageBlocks.length - 1, 0, {
      type: "table",
      caption: {pt: "Termos indicativos", en: "Indicative terms"},
      head: [
        {pt: "Termo", en: "Term"},
        {pt: "Indicativo", en: "Indicative"},
        {pt: "Base", en: "Basis"},
      ],
      rows: input.termSheet.terms.map((term) => [term.labels.pt, term.value.pt, term.basis]),
    });
    packageBlocks.splice(packageBlocks.length - 1, 0, {
      type: "list",
      items: [
        ...input.termSheet.collateral.map((item) => ({pt: `Garantia: ${item}`, en: `Collateral: ${item}`})),
        ...input.termSheet.covenants.map((item) => ({pt: `Covenant: ${item}`, en: `Covenant: ${item}`})),
      ],
    });
  }

  const packageMaterial: Material = {
    kind: "package",
    title: {
      pt: anonymous ? "Pacote para investidores" : `${name}: pacote para investidores`,
      en: anonymous ? "Investor package" : `${name}: investor package`,
    },
    blocks: packageBlocks,
    dependsOn: creditProfile.dependsOn,
  };

  // The two documents a DCM house circulates. Only when the desk ran: a memorandum without
  // the capital structure and the trajectory is the brochure this replaces.
  const institutional: Material[] = [];
  if (input.desk) {
    const shared = {
      brief: input.brief,
      facts: input.facts,
      calculations: input.calculations,
      exceptions: input.exceptions,
      desk: input.desk,
      trajectory: input.trajectory ?? null,
      ...(input.termSheet ? {termSheet: input.termSheet} : {}),
      ...(input.companyName ? {companyName: input.companyName} : {}),
      ...(input.rating ? {rating: input.rating} : {}),
      ...(input.stress ? {stress: input.stress} : {}),
      ...(input.instruments ? {instruments: input.instruments} : {}),
      ...(input.collateral ? {collateral: input.collateral} : {}),
      ...(input.price ? {price: input.price} : {}),
      ...(input.verdict ? {verdict: input.verdict} : {}),
    };
    institutional.push(creditMemo(shared));
    const sheet = termSheetDocument(shared);
    if (sheet) institutional.push(sheet);
    institutional.push(diligenceQa({facts: input.facts, calculations: input.calculations, desk: input.desk, trajectory: input.trajectory ?? null}, input.companyName));
  }

  const governedInstitutional = institutional.map((material) => ({
    ...material,
    blocks: [...material.blocks, DISCLAIMER],
  }));

  return {ok: true, materials: [...governedInstitutional, teaser, creditProfile, packageMaterial]};
}

/**
 * Whether a produced document still reflects the case.
 *
 * A material is a photograph of a fact set. When a fact it depends on changes, a reprocess, a
 * reviewer's correction, a new document, the photograph is stale, and saying so is better than
 * silently regenerating: someone may already have sent it.
 */
export function isStale(material: Material, currentValues: Map<string, string>, snapshotValues: Map<string, string>): boolean {
  return material.dependsOn.some((id) => {
    const now = currentValues.get(id);
    const then = snapshotValues.get(id);
    if (now === undefined || then === undefined) return now !== then;
    if (now === then) return false;
    const a = new Decimal(now);
    const b = new Decimal(then);
    return !a.isFinite() || !b.isFinite() || !a.equals(b);
  });
}
