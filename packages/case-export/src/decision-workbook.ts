import {
  toGovernedXlsxBuffer,
  type Cell,
  type CellFormat,
  type FinancialModel,
  type GovernedWorkbookAudit,
} from "@offroad/financial-model";
import type {DecisionArtifactContract} from "@offroad/case-understanding";

const L = (pt: string, en: string) => ({pt, en});
const header = (value: string): Cell => ({role: "header", value, format: "text"});
const label = (value: string): Cell => ({role: "label", value, format: "text"});
const note = (value: string): Cell => ({role: "note", value, format: "text"});
const historical = (value: string | number | boolean | null, format: CellFormat = "text"): Cell => value === null
  ? {role: "note", value: "n.a.", format: "text"}
  : {role: "historical", value: typeof value === "boolean" ? String(value) : value, format};
const input = (value: string | number | boolean | null, format: CellFormat = "text"): Cell => value === null
  ? {role: "input", value: "n.a.", format: "text"}
  : {role: "input", value: typeof value === "boolean" ? String(value) : value, format};
const formula = (expression: string, format: CellFormat = "text"): Cell => ({role: "formula", formula: expression, format});
const joinIds = (ids: readonly string[]) => ids.join(", ") || "n.a.";

function formatFor(unit: string | null): CellFormat {
  if (!unit) return "text";
  if (/\bx\b|multiple/i.test(unit)) return "multiple";
  if (/decimal|percent|%/i.test(unit)) return "percent";
  if (/r\$|brl|usd|eur|milh|million|thousand|money/i.test(unit)) return "money";
  if (/mes|month|year|ano/i.test(unit)) return "integer";
  return "text";
}

function quoteSheet(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

export type DecisionWorkbookAudit = GovernedWorkbookAudit & {
  decisionContractFingerprint: string;
  renderedClaimIds: string[];
  renderedSourceIds: string[];
  renderedAssumptionIds: string[];
  renderedGapIds: string[];
  renderedSeriesIds: string[];
};

export type DecisionWorkbookResult = {bytes: Uint8Array; audit: DecisionWorkbookAudit};

/**
 * Projects the canonical Decision Artifact into an editable, formula-linked workbook.
 *
 * This is intentionally a decision workbook, not an integrated forecast model. It displays
 * exactly the claims and series already present in the contract, exposes declared assumptions,
 * and carries missing dimensions without filling them in.
 */
export async function renderDecisionWorkbook(inputData: {
  contract: DecisionArtifactContract;
  locale: "pt-BR" | "en-US";
  title: string;
  companyName?: string;
}): Promise<DecisionWorkbookResult> {
  const {contract} = inputData;
  const lang = inputData.locale === "en-US" ? "en" : "pt";
  const names = {
    control: lang === "pt" ? "Controle" : "Control",
    claims: "Claims",
    assumptions: lang === "pt" ? "Premissas" : "Assumptions",
    series: lang === "pt" ? "Séries" : "Series",
    sources: lang === "pt" ? "Fontes" : "Sources",
    gaps: lang === "pt" ? "Lacunas" : "Gaps",
  };

  const claimRows = contract.claims.map((claim) => ({
    key: claim.id,
    cells: [
      label(claim.label),
      historical(claim.value, formatFor(claim.unit)),
      note(claim.unit ?? "n.a."),
      note(claim.evidenceState),
      note(`${claim.object.id}:${claim.object.path}`),
      note(joinIds(claim.sourceIds)),
      note(joinIds(claim.assumptionIds)),
      note(joinIds(claim.gapIds)),
      note(claim.object.fingerprint),
    ],
  }));
  const controlRows = contract.claims.map((claim, index) => ({
    key: `control-${claim.id}`,
    cells: [
      label(claim.label),
      formula(`${quoteSheet(names.claims)}!B${index + 2}`, formatFor(claim.unit)),
      note(claim.unit ?? "n.a."),
      note(claim.evidenceState),
      note(claim.id),
    ],
  }));
  const assumptionRows = contract.assumptions.map((assumption) => ({
    key: assumption.id,
    cells: [
      label(assumption.label),
      assumption.editable ? input(assumption.value, formatFor(assumption.unit)) : historical(assumption.value, formatFor(assumption.unit)),
      note(assumption.unit ?? "n.a."),
      note(assumption.basis),
      note(joinIds(assumption.sourceIds)),
      note(assumption.material ? (lang === "pt" ? "material" : "material") : (lang === "pt" ? "não material" : "not material")),
      note(assumption.id),
    ],
  }));
  const seriesRows = (contract.series ?? []).flatMap((series) => series.points.map((point) => ({
    key: `${series.id}-${point.label}`,
    cells: [
      label(series.label), label(point.label), historical(point.value, formatFor(series.unit)), note(series.unit ?? "n.a."),
      note(point.evidenceState), note(joinIds(point.sourceIds)), note(joinIds(point.assumptionIds)), note(joinIds(point.gapIds)), note(series.id),
    ],
  })));
  const sourceRows = contract.sources.map((source) => ({
    key: source.id,
    cells: [label(source.title), note(source.classification), historical(source.asOf), note(source.locator), note(source.id)],
  }));
  const gapRows = contract.gaps.map((gap) => ({
    key: gap.id,
    cells: [label(gap.label), note(gap.materiality), note(gap.impact), note(gap.requestedInput), note(gap.id)],
  }));

  const model: FinancialModel = {
    periods: [...new Set((contract.series ?? []).flatMap((series) => series.points.map((point) => point.label)))],
    deskAssumptions: contract.assumptions.map((assumption) => `${assumption.label}: ${String(assumption.value ?? "n.a.")} (${assumption.basis})`),
    sheets: [
      {key: "control", name: L(names.control, names.control), widths: [42, 18, 18, 20, 34], rows: [
        {key: "header", cells: [header(lang === "pt" ? "Indicador" : "Metric"), header(lang === "pt" ? "Valor" : "Value"), header(lang === "pt" ? "Unidade" : "Unit"), header(lang === "pt" ? "Estado da evidência" : "Evidence state"), header("Claim ID")]},
        ...controlRows,
      ]},
      {key: "claims", name: L(names.claims, names.claims), widths: [42, 18, 18, 20, 36, 36, 36, 36, 68], rows: [
        {key: "header", cells: [header(lang === "pt" ? "Indicador" : "Metric"), header(lang === "pt" ? "Valor controlado" : "Governed value"), header(lang === "pt" ? "Unidade" : "Unit"), header(lang === "pt" ? "Evidência" : "Evidence"), header(lang === "pt" ? "Objeto e campo" : "Object and field"), header("Source IDs"), header("Assumption IDs"), header("Gap IDs"), header(lang === "pt" ? "Fingerprint do objeto" : "Object fingerprint")]},
        ...claimRows,
      ]},
      {key: "assumptions", name: L(names.assumptions, names.assumptions), widths: [42, 18, 18, 58, 36, 18, 36], rows: [
        {key: "header", cells: [header(lang === "pt" ? "Premissa" : "Assumption"), header(lang === "pt" ? "Valor editável" : "Editable value"), header(lang === "pt" ? "Unidade" : "Unit"), header(lang === "pt" ? "Base" : "Basis"), header("Source IDs"), header(lang === "pt" ? "Materialidade" : "Materiality"), header("Assumption ID")]},
        ...assumptionRows,
      ]},
      {key: "series", name: L(names.series, names.series), widths: [36, 18, 18, 18, 20, 36, 36, 36, 36], rows: [
        {key: "header", cells: [header(lang === "pt" ? "Série" : "Series"), header(lang === "pt" ? "Período" : "Period"), header(lang === "pt" ? "Valor" : "Value"), header(lang === "pt" ? "Unidade" : "Unit"), header(lang === "pt" ? "Evidência" : "Evidence"), header("Source IDs"), header("Assumption IDs"), header("Gap IDs"), header("Series ID")]},
        ...seriesRows,
      ]},
      {key: "sources", name: L(names.sources, names.sources), widths: [42, 20, 18, 86, 36], rows: [
        {key: "header", cells: [header(lang === "pt" ? "Fonte" : "Source"), header(lang === "pt" ? "Classificação" : "Classification"), header(lang === "pt" ? "Data-base" : "As of"), header(lang === "pt" ? "Localizador" : "Locator"), header("Source ID")]},
        ...sourceRows,
      ]},
      {key: "gaps", name: L(names.gaps, names.gaps), widths: [42, 18, 72, 72, 36], rows: [
        {key: "header", cells: [header(lang === "pt" ? "Lacuna" : "Gap"), header(lang === "pt" ? "Materialidade" : "Materiality"), header(lang === "pt" ? "Impacto" : "Impact"), header(lang === "pt" ? "Informação solicitada" : "Requested input"), header("Gap ID")]},
        ...gapRows,
      ]},
    ],
  };

  const rendered = await toGovernedXlsxBuffer(model, lang, {
    title: inputData.title,
    ...(inputData.companyName ? {companyName: inputData.companyName} : {}),
    asOfDate: contract.asOf,
    currency: "according to governed claims",
    scale: "according to each claim and series",
    classification: "confidential",
    decisionContractFingerprint: contract.contractFingerprint,
    artifactClass: "decision_workbook",
  });
  return {
    bytes: rendered.bytes,
    audit: {
      ...rendered.audit,
      decisionContractFingerprint: contract.contractFingerprint,
      renderedClaimIds: contract.claims.map((claim) => claim.id),
      renderedSourceIds: contract.sources.map((source) => source.id),
      renderedAssumptionIds: contract.assumptions.map((assumption) => assumption.id),
      renderedGapIds: contract.gaps.map((gap) => gap.id),
      renderedSeriesIds: (contract.series ?? []).map((series) => series.id),
    },
  };
}
