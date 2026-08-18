/**
 * Expected fields of gold case G1 (Rede Horizonte), assembled from two synthetic
 * sources: the fixture candidates (`@offroad/testing-fixtures`) and the answer
 * key `02_GABARITO_OFFROAD/01_GABARITO_Analise_Esperada_Offroad.xlsx`
 * (generator `.codex-build/rede-horizonte-realistic/build_workbooks.mjs`, v3.2,
 * 14/08/2026). The answer key never enters the product; the committed
 * `expected/fields.json` must equal `buildRedeHorizonteGoldFields()` (test-enforced).
 */
import {buildRedeHorizonteDocumentIntake, redeHorizonteFileHashes} from "@offroad/testing-fixtures";
import {isMaterialFieldPath, resolveFieldPath} from "@offroad/credit-ontology";
import {canonicalValue} from "./snapshot";
import type {GoldField} from "./gold";

export function buildRedeHorizonteGoldFields(): {fields: GoldField[]; fromFixture: number} {
  const documents = Object.entries(redeHorizonteFileHashes).map(([name, sha256], index) => ({id: `doc-${index}`, original_name: name, sha256}));
  const fixture = buildRedeHorizonteDocumentIntake(documents);

  const fromFixture: GoldField[] = fixture.candidates.map((candidate) => {
    const definition = resolveFieldPath(candidate.fieldPath)?.definition;
    if (!definition) throw new Error(`fixture field not in ontology: ${candidate.fieldPath}`);
    const field: GoldField = {
      fieldPath: candidate.fieldPath,
      value: canonicalValue(candidate.normalizedValue),
      valueType: candidate.valueType,
      materiality: definition.materiality,
      sourceDocument: candidate.sourceName,
      tolerance: candidate.valueType === "number" && candidate.unit === "x" ? {kind: "relative", value: "0.005"} : {kind: "exact"},
      note: "fixture candidate (acceptance slice)",
    };
    if (candidate.periodStart) field.periodStart = candidate.periodStart;
    if (candidate.periodEnd) field.periodEnd = candidate.periodEnd;
    return field;
  });

  // R$ milhões in the gabarito → BRL absolute
  const brl = (millions: number): string => canonicalValue(Math.round(millions * 1_000_000));
  const auditadas = "02_Demonstracoes_Financeiras_Auditadas_2023_2025.pdf";
  const plano = "05_Business_Plan_3_Novas_Lojas_2026_2030.xlsx";
  const carta = "01_Carta_CFO_Pedido_e_Racional_Expansao.docx";
  const memorial = "07_Memorial_Descritivo_Expansao_3_Lojas.pdf";

  const historical: GoldField[] = [];
  for (const [year, revenue, ebitda, cash, grossDebt] of [
    [2023, 142.6, 20.2, 7.1, 52.0],
    [2024, 164.3, 25.5, 8.0, 60.0],
  ] as const) {
    const period = {periodStart: `${year}-01-01`, periodEnd: `${year}-12-31`};
    historical.push(
      {fieldPath: `historical_financials.${year}.revenue`, value: brl(revenue), valueType: "number", materiality: "material", sourceDocument: auditadas, ...period, tolerance: {kind: "exact"}, note: "gabarito HISTORICO_ESPERADO"},
      {fieldPath: `historical_financials.${year}.ebitda`, value: brl(ebitda), valueType: "number", materiality: "material", sourceDocument: auditadas, ...period, tolerance: {kind: "exact"}, note: "gabarito HISTORICO_ESPERADO"},
      {fieldPath: `historical_financials.${year}.cash`, value: brl(cash), valueType: "number", materiality: "material", sourceDocument: auditadas, periodEnd: `${year}-12-31`, tolerance: {kind: "exact"}, note: "gabarito HISTORICO_ESPERADO"},
      {fieldPath: `historical_financials.${year}.gross_debt`, value: brl(grossDebt), valueType: "number", materiality: "material", sourceDocument: auditadas, periodEnd: `${year}-12-31`, tolerance: {kind: "exact"}, note: "gabarito HISTORICO_ESPERADO"},
    );
  }

  const sourcesAndUses: GoldField[] = [];
  const sourcesUsesRows: Array<[side: "sources" | "uses", item: string, millions: number, doc: string]> = [
    ["sources", "Tranche expansão (nova dívida)", 35, plano],
    ["sources", "Tranche refinanciamento", 19, carta],
    ["sources", "Aporte dos acionistas", 10, carta],
    ["sources", "Caixa da companhia", 4, plano],
    ["uses", "Investimento no projeto (3 lojas)", 49, plano],
    ["uses", "Refinanciamento de dívida existente", 19, carta],
  ];
  sourcesUsesRows.forEach(([side, item, millions, doc], index) => {
    const i = index + 1;
    sourcesAndUses.push(
      {fieldPath: `transaction.sources_and_uses.${i}.side`, value: side, valueType: "text", materiality: "material", sourceDocument: doc, tolerance: {kind: "exact"}, note: "gabarito ADD_ON_ESPERADO (mix de funding)"},
      {fieldPath: `transaction.sources_and_uses.${i}.item`, value: item, valueType: "text", materiality: "material", sourceDocument: doc, tolerance: {kind: "exact"}, note: "gabarito ADD_ON_ESPERADO (mix de funding)"},
      {fieldPath: `transaction.sources_and_uses.${i}.amount`, value: brl(millions), valueType: "number", materiality: "material", sourceDocument: doc, tolerance: {kind: "exact"}, note: "gabarito ADD_ON_ESPERADO (mix de funding)"},
    );
  });

  const project: GoldField[] = [
    {fieldPath: "project.locations", value: JSON.stringify(["Franca", "Araraquara", "São Carlos"]), valueType: "list", materiality: "supporting", sourceDocument: memorial, tolerance: {kind: "exact"}, note: "gabarito ADD_ON_ESPERADO"},
    {fieldPath: "project.investments.1.name", value: "Franca", valueType: "text", materiality: "material", sourceDocument: plano, tolerance: {kind: "exact"}, note: "investimento por loja (gabarito ADD_ON_ESPERADO)"},
    {fieldPath: "project.investments.1.amount", value: brl(14.6), valueType: "number", materiality: "material", sourceDocument: plano, tolerance: {kind: "exact"}, note: "investimento por loja (gabarito ADD_ON_ESPERADO)"},
    {fieldPath: "project.investments.2.name", value: "Araraquara", valueType: "text", materiality: "material", sourceDocument: plano, tolerance: {kind: "exact"}, note: "investimento por loja (gabarito ADD_ON_ESPERADO)"},
    {fieldPath: "project.investments.2.amount", value: brl(15.2), valueType: "number", materiality: "material", sourceDocument: plano, tolerance: {kind: "exact"}, note: "investimento por loja (gabarito ADD_ON_ESPERADO)"},
    {fieldPath: "project.investments.3.name", value: "São Carlos", valueType: "text", materiality: "material", sourceDocument: plano, tolerance: {kind: "exact"}, note: "investimento por loja (gabarito ADD_ON_ESPERADO)"},
    {fieldPath: "project.investments.3.amount", value: brl(15.8), valueType: "number", materiality: "material", sourceDocument: plano, tolerance: {kind: "exact"}, note: "investimento por loja (gabarito ADD_ON_ESPERADO)"},
    {fieldPath: "project.investments.4.name", value: "Compartilhado", valueType: "text", materiality: "material", sourceDocument: plano, tolerance: {kind: "exact"}, note: "investimento compartilhado (gabarito ADD_ON_ESPERADO)"},
    {fieldPath: "project.investments.4.amount", value: brl(3.4), valueType: "number", materiality: "material", sourceDocument: plano, tolerance: {kind: "exact"}, note: "investimento compartilhado (gabarito ADD_ON_ESPERADO)"},
    {fieldPath: "transaction.timeline.1.milestone", value: "Abertura Franca", valueType: "text", materiality: "supporting", sourceDocument: plano, tolerance: {kind: "exact"}, note: "gabarito ADD_ON_ESPERADO"},
    {fieldPath: "transaction.timeline.1.date", value: "2027-04-01", valueType: "date", materiality: "supporting", sourceDocument: plano, tolerance: {kind: "exact"}, note: "gabarito ADD_ON_ESPERADO"},
    {fieldPath: "transaction.timeline.2.milestone", value: "Abertura Araraquara", valueType: "text", materiality: "supporting", sourceDocument: plano, tolerance: {kind: "exact"}, note: "gabarito ADD_ON_ESPERADO"},
    {fieldPath: "transaction.timeline.2.date", value: "2027-07-01", valueType: "date", materiality: "supporting", sourceDocument: plano, tolerance: {kind: "exact"}, note: "gabarito ADD_ON_ESPERADO"},
    {fieldPath: "transaction.timeline.3.milestone", value: "Abertura São Carlos", valueType: "text", materiality: "supporting", sourceDocument: plano, tolerance: {kind: "exact"}, note: "gabarito ADD_ON_ESPERADO"},
    {fieldPath: "transaction.timeline.3.date", value: "2027-10-01", valueType: "date", materiality: "supporting", sourceDocument: plano, tolerance: {kind: "exact"}, note: "gabarito ADD_ON_ESPERADO"},
  ];

  const fields = [...fromFixture, ...historical, ...sourcesAndUses, ...project];
  for (const field of fields) {
    if (!resolveFieldPath(field.fieldPath)) throw new Error(`gold field not in ontology: ${field.fieldPath}`);
    if (field.materiality !== (isMaterialFieldPath(field.fieldPath) ? "material" : "supporting")) throw new Error(`materiality mismatch for ${field.fieldPath}`);
  }
  const seen = new Set<string>();
  for (const field of fields) {
    const key = `${field.fieldPath}|${field.periodEnd ?? ""}|${field.sourceDocument ?? ""}`;
    if (seen.has(key)) throw new Error(`duplicate gold field: ${key}`);
    seen.add(key);
  }
  return {fields, fromFixture: fromFixture.length};
}
