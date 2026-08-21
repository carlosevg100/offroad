/**
 * Renders Aurora's institutional documents to HTML, so they can be looked at.
 *
 * The memorandum and the term sheet are judged by eye before they are judged by any test, and a
 * renderer nobody has looked at is a renderer nobody should trust. This builds the full state
 * the app would build for Aurora (battery, trajectory, capacity, term sheet), with a hand-written
 * brief standing in for the model's, compiles the materials and writes the HTML.
 *
 *   pnpm --filter @offroad/case-render render:aurora [outDir]
 */
import {mkdirSync, writeFileSync} from "node:fs";
import {join} from "node:path";

import {compileMaterials} from "@offroad/case-materials";
import type {CaseBrief, ReadinessReport} from "@offroad/case-understanding";
import {deskEvidence} from "@offroad/case-understanding";
import {analyzeCreditPosition, buildDeskInputs, projectLeverageTrajectory, type Fact} from "@offroad/credit-analysis";
import {assessCapacity, buildTermSheet} from "@offroad/deal-structure";

import {renderMaterialHtml} from "../src/html";

const outDir = process.argv[2] ?? join(process.cwd(), "out", "aurora");
mkdirSync(outDir, {recursive: true});

const facts: Fact[] = [
  {fieldPath: "historical_financials.2025.revenue", value: "191200000"},
  {fieldPath: "historical_financials.2025.ebitda", value: "16848000"},
  {fieldPath: "historical_financials.2025.cogs", value: "143400000"},
  {fieldPath: "historical_financials.2025.cash", value: "8420000"},
  {fieldPath: "historical_financials.2025.receivables", value: "47310000"},
  {fieldPath: "historical_financials.2025.inventory", value: "39880000"},
  {fieldPath: "historical_financials.2025.payables", value: "33540000"},
  {fieldPath: "historical_financials.2025.gross_debt", value: "45320000"},
  {fieldPath: "interim_financials.2026_07.revenue_7m", value: "121640000"},
  {fieldPath: "interim_financials.2026_07.receivables", value: "51940000"},
  ...[
    ["Banco Itaú", "9840000", "CDI + 4,10% a.a.", "2027-11-20", "Mensal", "Duplicatas 130%", "Dívida líquida/EBITDA <= 3,0x"],
    ["Banco Bradesco", "7500000", "CDI + 3,85% a.a.", "2028-04-15", "Mensal com 6m carência", "Aval dos sócios", "Dívida líquida/EBITDA <= 3,25x"],
    ["Banco Santander", "6260000", "CDI + 4,45% a.a.", "2027-03-10", "Mensal", "Duplicatas 125%", ""],
    ["Banco do Brasil", "5180000", "TLP + 2,90% a.a.", "2030-08-01", "Mensal", "Alienação fiduciária da frota", ""],
    ["Sicredi", "4120000", "CDI + 5,20% a.a.", "2027-06-30", "Mensal", "Aval dos sócios", ""],
    ["BTG Pactual", "3780000", "1,42% a.m.", "2026-12-20", "No vencimento", "Recebíveis cedidos", ""],
    ["Banco Volkswagen", "1820000", "1,18% a.m.", "2029-02-15", "Mensal", "Alienação fiduciária de 11 veículos", ""],
  ].flatMap(([lender, balance, rate, maturity, amort, collateral, covenant], index) => {
    const n = index + 1;
    return [
      {fieldPath: `debt.instruments.${n}.lender`, value: lender!},
      {fieldPath: `debt.instruments.${n}.balance`, value: balance!},
      {fieldPath: `debt.instruments.${n}.rate`, value: rate!},
      {fieldPath: `debt.instruments.${n}.maturity`, value: maturity!},
      {fieldPath: `debt.instruments.${n}.amortization`, value: amort!},
      {fieldPath: `debt.instruments.${n}.collateral`, value: collateral!},
      ...(covenant ? [{fieldPath: `debt.instruments.${n}.covenants`, value: covenant}] : []),
    ];
  }),
  {fieldPath: "transaction.requested_amount", value: "42300000"},
  {fieldPath: "transaction.desired_term_months", value: "48"},
  {fieldPath: "transaction.desired_grace_months", value: "6"},
  {fieldPath: "transaction.expected_rate", value: "CDI + 4,00% a.a."},
  {fieldPath: "transaction.use_of_proceeds.1.item", value: "Capital de giro (reforço do ciclo de recebíveis)"},
  {fieldPath: "transaction.use_of_proceeds.1.amount", value: "25000000"},
  {fieldPath: "projections.2026.revenue", value: "208500000"},
  ...[[2026, "18760000"], [2027, "22270000"], [2028, "26320000"], [2029, "29510000"], [2030, "32490000"]].map(([year, ebitda]) => ({
    fieldPath: `projections.${year}.ebitda`, value: String(ebitda),
  })),
];

const inputs = buildDeskInputs(facts, {
  referenceDate: "2026-08-21",
  indexLevels: {cdi: "0.105", tlp: "0.079", ipca: "0.045"},
  statedRequest: {amount: "40000000"},
});
const desk = analyzeCreditPosition(inputs.desk!);
const trajectory = projectLeverageTrajectory(inputs.trajectory!);

const capacity = assessCapacity({
  archetypeId: "growth_expansion",
  requested: "42300000",
  cfads: "16848000",
  adjustedEbitda: "16848000",
  existingNetDebt: "36900000",
  annualDebtServiceFactor: "0.40",
});
const termSheet = buildTermSheet({
  archetypeId: "growth_expansion",
  capacity,
  requestedTermMonths: 48,
  requestedGraceMonths: 6,
  expectedRate: "CDI + 4,00% a.a.",
  blockers: [],
});

// A brief standing in for the model's. Non-material narrative, so the audit passes without a
// fact set wired in; the numbers in the document come from the battery, not from here.
const brief: CaseBrief = {
  executiveSummary:
    "A Aurora Distribuidora de Materiais de Construção Ltda, distribuidora com quatro unidades no Vale do Paraíba e 214 colaboradores, busca captação para alongar o ciclo de caixa e implantar o quarto centro de distribuição, em Jacareí. A receita cresceu a dois dígitos nos últimos dois exercícios, com margem EBITDA estável na casa de 9%. A operação, como pedida, romperia covenant existente no primeiro dia; a estrutura proposta quita as linhas com covenant dentro do tíquete e desloca o teste para um covenant próprio, escalonado sobre a trajetória projetada. Os principais pontos em aberto são o valor da operação, declarado em dois montantes distintos, e a composição de R$ 6,8 milhões de dívida reconhecida no balanço e ausente do mapa.",
  sections: [
    {id: "identity", heading: "Identidade", claims: [
      {id: "c1", text: "Sociedade limitada constituída em 2004, sediada em São José dos Campos (SP), controlada por Helena Bastos Corrêa (52%), Rafael Bastos Corrêa (33%) e Participações Vale do Paraíba Ltda (15%).", material: false, kind: "fact", supportIds: []},
    ]},
    {id: "business", heading: "Negócio", claims: [
      {id: "c2", text: "Distribuição atacadista e varejista de materiais de construção, ferragens e ferramentas, com serviços de logística e entrega, para construtoras, incorporadoras, redes de franquia e o setor público regional.", material: false, kind: "fact", supportIds: []},
      {id: "c3", text: "O maior cliente responde por 18,1% da receita e os cinco maiores por 47,6%, concentração compatível com o segmento mas relevante para a base de recebíveis oferecida em garantia.", material: false, kind: "judgment", supportIds: []},
    ]},
    {id: "request", heading: "Pedido", claims: [
      {id: "c4", text: "Captação de longo prazo com carência, destinada a capital de giro e ao centro de distribuição de Jacareí, com expectativa de custo próxima ao estoque atual de dívida.", material: false, kind: "fact", supportIds: []},
    ]},
    {id: "history", heading: "Histórico", claims: [
      {id: "c5", text: "Crescimento de receita de 17,9% em 2024 e 13,5% em 2025, com lucro bruto estável em 25% da receita e despesas comerciais e administrativas crescendo em linha.", material: false, kind: "fact", supportIds: []},
    ]},
    {id: "current_position", heading: "Posição atual", claims: [
      {id: "c6", text: "O balancete de julho de 2026 mostra receita acumulada de sete meses que anualiza em linha com a projeção do ano, e recebíveis em alta frente ao encerramento de 2025.", material: false, kind: "fact", supportIds: []},
    ]},
    {id: "project", heading: "Projeto", claims: [
      {id: "c7", text: "Centro de distribuição de 9.600 m² em terreno de 18.400 m² em Jacareí, início de obra em novembro de 2026 e operação em setembro de 2027. A licença ambiental prévia está protocolada na CETESB e ainda não emitida.", material: false, kind: "fact", supportIds: []},
    ]},
    {id: "projections", heading: "Projeções", claims: [
      {id: "c8", text: "A companhia projeta receita de R$ 321,7 milhões e EBITDA de R$ 32,5 milhões em 2030, com a margem subindo 0,6 ponto com o novo centro. A base de 2025 usada no modelo é preliminar e diverge do auditado.", material: false, kind: "fact", supportIds: []},
    ]},
    {id: "strengths", heading: "Pontos fortes", claims: []},
    {id: "risks", heading: "Riscos", claims: []},
    {id: "executive_summary", heading: "Sumário", claims: []},
  ],
};

const readiness: ReadinessReport = {state: "in_progress", score: 0.8, components: [], blockers: []};
const evidence = deskEvidence(desk, trajectory);

const compiled = compileMaterials({
  brief,
  facts: [],
  calculations: evidence.calculations,
  exceptions: [],
  readiness,
  termSheet,
  desk,
  trajectory,
  companyName: "Aurora Distribuidora de Materiais de Construção Ltda",
});
if (!compiled.ok) {
  console.error("materiais recusados:", compiled.reason, compiled.detail);
  process.exit(1);
}

for (const material of compiled.materials) {
  const html = renderMaterialHtml({
    material,
    lang: "pt",
    meta: {
      issuedOn: "2026-08-21",
      companyName: "Aurora Distribuidora de Materiais de Construção Ltda",
      sources: evidence.calculations.map((calculation) => ({id: calculation.id, label: calculation.labels.pt})),
    },
  });
  const file = join(outDir, `${material.kind}.html`);
  writeFileSync(file, html, "utf8");
  console.log(`${material.kind.padEnd(16)} ${material.blocks.length} blocos -> ${file}`);
}
