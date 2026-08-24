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
  const erp = "03_Export_ERP_Contabilidade_2024_Jul2026.xlsx";
  const mapaDivida = "04_Mapa_Divida_Garantias_Jul2026.xlsx";

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
    {fieldPath: "project.investments.1.stabilized_revenue", value: brl(32), valueType: "number", materiality: "material", sourceDocument: plano, tolerance: {kind: "exact"}, note: "receita estabilizada por loja (gabarito ADD_ON_ESPERADO)"},
    {fieldPath: "project.investments.1.stabilized_ebitda_margin", value: "0.142", valueType: "number", materiality: "material", sourceDocument: plano, tolerance: {kind: "exact"}, note: "margem estabilizada por loja (gabarito ADD_ON_ESPERADO)"},
    {fieldPath: "project.investments.2.name", value: "Araraquara", valueType: "text", materiality: "material", sourceDocument: plano, tolerance: {kind: "exact"}, note: "investimento por loja (gabarito ADD_ON_ESPERADO)"},
    {fieldPath: "project.investments.2.amount", value: brl(15.2), valueType: "number", materiality: "material", sourceDocument: plano, tolerance: {kind: "exact"}, note: "investimento por loja (gabarito ADD_ON_ESPERADO)"},
    {fieldPath: "project.investments.2.stabilized_revenue", value: brl(29), valueType: "number", materiality: "material", sourceDocument: plano, tolerance: {kind: "exact"}, note: "receita estabilizada por loja (gabarito ADD_ON_ESPERADO)"},
    {fieldPath: "project.investments.2.stabilized_ebitda_margin", value: "0.138", valueType: "number", materiality: "material", sourceDocument: plano, tolerance: {kind: "exact"}, note: "margem estabilizada por loja (gabarito ADD_ON_ESPERADO)"},
    {fieldPath: "project.investments.3.name", value: "São Carlos", valueType: "text", materiality: "material", sourceDocument: plano, tolerance: {kind: "exact"}, note: "investimento por loja (gabarito ADD_ON_ESPERADO)"},
    {fieldPath: "project.investments.3.amount", value: brl(15.8), valueType: "number", materiality: "material", sourceDocument: plano, tolerance: {kind: "exact"}, note: "investimento por loja (gabarito ADD_ON_ESPERADO)"},
    {fieldPath: "project.investments.3.stabilized_revenue", value: brl(33), valueType: "number", materiality: "material", sourceDocument: plano, tolerance: {kind: "exact"}, note: "receita estabilizada por loja (gabarito ADD_ON_ESPERADO)"},
    {fieldPath: "project.investments.3.stabilized_ebitda_margin", value: "0.145", valueType: "number", materiality: "material", sourceDocument: plano, tolerance: {kind: "exact"}, note: "margem estabilizada por loja (gabarito ADD_ON_ESPERADO)"},
    {fieldPath: "project.investments.4.name", value: "Compartilhado", valueType: "text", materiality: "material", sourceDocument: plano, tolerance: {kind: "exact"}, note: "investimento compartilhado (gabarito ADD_ON_ESPERADO)"},
    {fieldPath: "project.investments.4.amount", value: brl(3.4), valueType: "number", materiality: "material", sourceDocument: plano, tolerance: {kind: "exact"}, note: "investimento compartilhado (gabarito ADD_ON_ESPERADO)"},
    {fieldPath: "transaction.timeline.1.milestone", value: "Abertura Franca", valueType: "text", materiality: "supporting", sourceDocument: plano, tolerance: {kind: "exact"}, note: "gabarito ADD_ON_ESPERADO"},
    {fieldPath: "transaction.timeline.1.date", value: "2027-04-01", valueType: "date", materiality: "supporting", sourceDocument: plano, tolerance: {kind: "exact"}, note: "gabarito ADD_ON_ESPERADO"},
    {fieldPath: "transaction.timeline.2.milestone", value: "Abertura Araraquara", valueType: "text", materiality: "supporting", sourceDocument: plano, tolerance: {kind: "exact"}, note: "gabarito ADD_ON_ESPERADO"},
    {fieldPath: "transaction.timeline.2.date", value: "2027-07-01", valueType: "date", materiality: "supporting", sourceDocument: plano, tolerance: {kind: "exact"}, note: "gabarito ADD_ON_ESPERADO"},
    {fieldPath: "transaction.timeline.3.milestone", value: "Abertura São Carlos", valueType: "text", materiality: "supporting", sourceDocument: plano, tolerance: {kind: "exact"}, note: "gabarito ADD_ON_ESPERADO"},
    {fieldPath: "transaction.timeline.3.date", value: "2027-10-01", valueType: "date", materiality: "supporting", sourceDocument: plano, tolerance: {kind: "exact"}, note: "gabarito ADD_ON_ESPERADO"},
  ];

  const balanceSheet: GoldField[] = [
    {fieldPath: "historical_financials.2025.receivables", value: brl(18.0), valueType: "number", materiality: "material", sourceDocument: auditadas, periodEnd: "2025-12-31", tolerance: {kind: "exact"}, note: "demonstrações auditadas, balanço patrimonial"},
    {fieldPath: "historical_financials.2025.inventory", value: brl(29.7), valueType: "number", materiality: "material", sourceDocument: auditadas, periodEnd: "2025-12-31", tolerance: {kind: "exact"}, note: "demonstrações auditadas, balanço patrimonial"},
    {fieldPath: "historical_financials.2025.payables", value: brl(22.5), valueType: "number", materiality: "material", sourceDocument: auditadas, periodEnd: "2025-12-31", tolerance: {kind: "exact"}, note: "demonstrações auditadas, balanço patrimonial"},
    {fieldPath: "interim_financials.2026_07.receivables", value: brl(19.4), valueType: "number", materiality: "material", sourceDocument: erp, periodEnd: "2026-07-31", tolerance: {kind: "exact"}, note: "ERP, balancete de julho de 2026"},
    {fieldPath: "interim_financials.2026_07.inventory", value: brl(32.6), valueType: "number", materiality: "material", sourceDocument: erp, periodEnd: "2026-07-31", tolerance: {kind: "exact"}, note: "ERP, balancete de julho de 2026"},
    {fieldPath: "interim_financials.2026_07.payables", value: brl(24.8), valueType: "number", materiality: "material", sourceDocument: erp, periodEnd: "2026-07-31", tolerance: {kind: "exact"}, note: "ERP, balancete de julho de 2026"},
  ];

  const projections: GoldField[] = [];
  for (const [year, revenue, ebitda] of [
    [2026, 203.0, 34.0],
    [2027, 242.6, 38.4],
    [2028, 318.9, 51.4],
    [2029, 343.5, 56.3],
    [2030, 364.4, 60.2],
  ] as const) {
    projections.push(
      {fieldPath: `projections.${year}.revenue`, value: brl(revenue), valueType: "number", materiality: "material", sourceDocument: plano, periodEnd: `${year}-12-31`, tolerance: {kind: "exact"}, note: "business plan, resumo anual consolidado"},
      {fieldPath: `projections.${year}.ebitda`, value: brl(ebitda), valueType: "number", materiality: "material", sourceDocument: plano, periodEnd: `${year}-12-31`, tolerance: {kind: "exact"}, note: "business plan, resumo anual consolidado"},
    );
  }

  const debtRows = [
    {lender: "Banco Horizonte", instrument: "Capital de giro", original: 20, balance: 15, rate: "CDI + 3,20%", maturity: "2027-03-15", amortization: "Bullet", collateral: "Recebíveis"},
    {lender: "Banco Sul", instrument: "Finame equipamentos", original: 18, balance: 12, rate: "CDI + 2,60%", maturity: "2029-06-30", amortization: "Mensal", collateral: "Equipamentos"},
    {lender: "FIDC Alfa", instrument: "Antecipação de cartões", original: 16, balance: 14, rate: "CDI + 4,10%", maturity: "2027-09-30", amortization: "Rotativo", collateral: "Recebíveis"},
    {lender: "Banco Interior", instrument: "Financiamento imobiliário", original: 24, balance: 18, rate: "IPCA + 7,50%", maturity: "2030-09-01", amortization: "Mensal", collateral: "Hipoteca do CD"},
    {lender: "Fornecedor FrioMax", instrument: "Equipamentos", original: 7, balance: 5, rate: "15,0% a.a. prefixado", maturity: "2027-12-01", amortization: "Mensal", collateral: "Equipamentos"},
    {lender: "Banco Horizonte", instrument: "Conta garantida", original: 4, balance: 4, rate: "CDI + 5,00%", maturity: "2026-12-20", amortization: "Bullet", collateral: "Sem garantia real"},
  ] as const;
  const debt: GoldField[] = [];
  debtRows.forEach((row, offset) => {
    const index = offset + 1;
    const add = (suffix: string, value: string, valueType: GoldField["valueType"]) => {
      const fieldPath = `debt.instruments.${index}.${suffix}`;
      debt.push({
        fieldPath,
        value,
        valueType,
        materiality: isMaterialFieldPath(fieldPath) ? "material" : "supporting",
        sourceDocument: mapaDivida,
        tolerance: {kind: "exact"},
        note: "mapa de dívida, posição em 31/07/2026",
      });
    };
    add("lender", row.lender, "text");
    add("instrument_type", row.instrument, "text");
    add("original_amount", brl(row.original), "number");
    add("balance", brl(row.balance), "number");
    add("currency", "BRL", "text");
    add("rate", row.rate, "text");
    add("maturity", row.maturity, "date");
    add("amortization", row.amortization, "text");
    add("collateral", row.collateral, "text");
  });

  const fields = [...fromFixture, ...historical, ...balanceSheet, ...projections, ...debt, ...sourcesAndUses, ...project];
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
