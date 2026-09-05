/**
 * Case 03 (advisor with Aurora's scattered documents): the deterministic tables of its answer key,
 * computed from the declared truth of the fixture by the receivables analysis and the financial-core.
 *
 *   pnpm --filter @offroad/evals gc03:tables
 */
import {buildDebtServiceSchedule, calculateDscr, calculateLeverage, checkIdentity} from "@offroad/financial-core";
import {analyzeReceivables, toReceivablesCaseFromSimpleTape} from "@offroad/receivables-analysis";
import {fakeco, fakecoReceivables} from "@offroad/testing-fixtures";
import Decimal from "decimal.js";

const d = (value: Decimal.Value) => new Decimal(value);
const fmt = (value: Decimal.Value | null | undefined) => value === null || value === undefined ? "n/a" : d(value).toDecimalPlaces(0).toNumber().toLocaleString("pt-BR");
const pct = (value: Decimal.Value | null | undefined) => value === null || value === undefined ? "n/a" : `${d(value).times(100).toFixed(1)}%`;
const x = (value: Decimal.Value | null | undefined) => value === null || value === undefined ? "n/a" : `${d(value).toFixed(2)}x`;
const {balance2025, historical, interim2026, debt, leasingOffMap, request, project, projections, contradictions} = fakeco;
const rows = fakecoReceivables.buildReceivablesTape();
const md: string[] = [];

// 1. Reconciliation the gold plants (declared contradictions) and the debt map against the balance sheet.
md.push("### Conciliação plantada (verdade declarada do fixture)", "", "| Item | Fonte A | Fonte B | Diferença | Resolução |", "| --- | ---: | ---: | ---: | --- |");
for (const c of contradictions) {
  const values = Object.entries(c).filter(([key, value]) => typeof value === "number" && key !== "difference") as Array<[string, number]>;
  md.push(`| ${c.field} | ${values[0]![0]} ${fmt(values[0]![1])} | ${values[1]![0]} ${fmt(values[1]![1])} | ${fmt(values[0]![1] - values[1]![1])} | ${c.resolution}: ${c.why} |`);
}
const mapTotal = debt.reduce((sum, line) => sum + line.outstanding, 0);
const bridge = checkIdentity({id: "debt.map_vs_balance", left: d(mapTotal).plus(leasingOffMap), right: balance2025.grossDebtOnBalance});
md.push("", `Mapa de dívida ${fmt(mapTotal)} mais arrendamento fora do mapa ${fmt(leasingOffMap)} = balanço ${fmt(balance2025.grossDebtOnBalance)}: identidade ${bridge.status === "pass" ? "fecha" : "não fecha"} (diferença ${fmt(bridge.difference)}).`);

// 2. Leverage and coverage on the audited 2025 and the interim (seven months, not annualized in the base).
const netDebt = d(balance2025.grossDebtOnBalance).minus(balance2025.cash);
const leverage = calculateLeverage(netDebt, historical[2].ebitda);
const grossLeverage = calculateLeverage(balance2025.grossDebtOnBalance, historical[2].ebitda);
const coverage = calculateDscr(historical[2].ebitda, historical[2].financialExpenses);
md.push("", "### Alavancagem e cobertura (auditado 2025, financial-core)", "", "| Métrica | Valor | Operandos |", "| --- | ---: | --- |",
  `| Dívida bruta (balanço) | ${fmt(balance2025.grossDebtOnBalance)} | inclui arrendamento de ${fmt(leasingOffMap)} ausente do mapa |`,
  `| Dívida líquida | ${fmt(netDebt)} | bruta menos caixa ${fmt(balance2025.cash)} |`,
  `| Dívida líquida / EBITDA | ${x(leverage.value)} | EBITDA 2025 ${fmt(historical[2].ebitda)} |`,
  `| Dívida bruta / EBITDA | ${x(grossLeverage.value)} | |`,
  `| EBITDA / despesas financeiras (proxy declarado) | ${x(coverage.value)} | despesas financeiras 2025 ${fmt(historical[2].financialExpenses)} |`,
  `| Covenant Itaú e Bradesco: dívida líquida / EBITDA ≤ 3,0x | headroom ${d(3).minus(leverage.value).toFixed(2)} | pelo mapa de dívida; definição contratual não anexada |`);
const wc = d(balance2025.receivables).plus(balance2025.inventory).minus(balance2025.suppliers);
md.push("", `Capital de giro operacional 2025: recebíveis ${fmt(balance2025.receivables)} mais estoques ${fmt(balance2025.inventory)} menos fornecedores ${fmt(balance2025.suppliers)} = ${fmt(wc)}; ciclo: DSO ${d(balance2025.receivables).div(historical[2].revenue).times(365).toFixed(0)} dias, DIO ${d(balance2025.inventory).div(historical[2].cogs).times(365).toFixed(0)} dias, DPO ${d(balance2025.suppliers).div(historical[2].cogs).times(365).toFixed(0)} dias. Balancete de julho de 2026 (sete meses): receita ${fmt(interim2026.revenue)}, EBITDA ${fmt(interim2026.ebitda)}, recebíveis ${fmt(interim2026.receivables)}.`);

// 3. Concentration and the receivables analysis on the synthetic tape, with the encumbrances of the debt map.
const byDebtor = fakecoReceivables.agingByDebtor(rows);
const total = rows.reduce((sum, row) => sum + row.balance, 0);
const topShare = (n: number) => d(byDebtor.slice(0, n).reduce((sum, entry) => sum + entry.total, 0)).div(total);
md.push("", "### Concentração por sacado (tape de 31/07/2026)", "", `Top 1 ${pct(topShare(1))} (${byDebtor[0]!.debtorName}); top 5 ${pct(topShare(5))}; top 10 ${pct(topShare(10))}; ${byDebtor.length} sacados; carteira ${fmt(total)} igual ao balancete.`);
const simple = toReceivablesCaseFromSimpleTape({id: "gc03-aurora-2026-07", referenceDate: fakecoReceivables.receivablesReferenceDate, cedentName: fakeco.company.legalName, tape: rows.map((row) => ({receivableId: row.receivableId, debtorId: row.debtorId, balance: String(row.balance), daysPastDue: row.daysPastDue}))});
const encumbranceOf = new Map(rows.map((row) => [row.receivableId, row.encumbrance]));
const sectorOf = new Map(rows.map((row) => [row.receivableId, row.sector]));
const withEncumbrances = {
  ...simple,
  portfolio: simple.portfolio.map((item) => ({...item, encumbrance: (encumbranceOf.get(item.id) ?? "unknown") as "free" | "pledged" | "assigned" | "unknown", debtorSector: sectorOf.get(item.id) === "public" ? "public_sector" : "construction_distribution", sourceDocumentId: "10_Tape_Duplicatas_Jul2026.csv", sourceAnchor: `row:${item.id}`})),
  accounting: {...simple.accounting, grossReceivablesBalance: String(interim2026.receivables)},
  structure: {...simple.structure, requestedFacility: String(request.useOfProceeds[0].amount), actualSeniorAmount: String(request.useOfProceeds[0].amount), actualSubordinatedAmount: "0"},
};
const analysis = analyzeReceivables(withEncumbrances);
const m = analysis.metrics;
md.push("", "### Análise da carteira (receivables-analysis, política padrão)", "", "| Métrica | Valor |", "| --- | ---: |",
  `| Carteira | ${fmt(m.portfolio.totalOutstanding)} |`, `| Elegível preliminar | ${fmt(m.portfolio.preliminaryEligibleBalance)} (${pct(m.portfolio.eligibleShare)}) |`,
  `| Elegível ajustado por concentração | ${fmt(m.portfolio.concentrationAdjustedEligibleBalance)} |`, `| Livre de ônus | ${pct(m.evidence.freeBalanceShare)} da carteira |`,
  `| Maior sacado | ${pct(m.portfolio.topDebtorShare)} | `, `| Cinco maiores | ${pct(m.portfolio.topFiveDebtorShare)} |`,
  `| Inadimplência acima de 30 dias | ${pct(m.performance.delinquency30Share)} |`, `| Acima de 90 dias | ${pct(m.performance.delinquency90Share)} |`,
  `| Facilidade pedida (tranche de giro) | ${fmt(analysis.structure.requestedFacility)} |`, `| Máximo por advance rate (75%) | ${fmt(analysis.structure.maximumByAdvanceRate)} |`,
  `| Máximo por sobrecolateralização | ${fmt(analysis.structure.maximumByOvercollateralization)} |`, `| Facilidade suportada | ${fmt(analysis.structure.supportedFacility)} |`,
  `| Decisão | ${analysis.decision.status}; bloqueios: ${analysis.decision.blockingCodes.join(", ") || "nenhum"}; remediações: ${analysis.decision.remediationCodes.join(", ") || "nenhuma"} |`);
md.push("", "Aging: " + Object.entries(m.aging).map(([bucket, value]) => `${bucket} ${fmt(value)}`).join("; ") + ".");
md.push("", "Gatilhos: " + analysis.triggers.map((trigger) => `${trigger.id} ${trigger.actual} contra ${trigger.threshold} (${trigger.status})`).join("; ") + ".");
md.push("", "Lacunas: " + (analysis.gaps.map((gap) => `${gap.code} [${gap.severity}]`).join("; ") || "nenhuma") + ".");

// 4. Sizing of the request by debt service and DSCR against the projected EBITDA (proxy for CFADS, declared).
const cdi = 0.1391;
const schedule = buildDebtServiceSchedule({amount: request.amount, annualRate: cdi + 0.04, rateConvention: "effective_annual", termMonths: request.termMonths, graceMonths: request.graceMonths, graceInterest: "paid", format: "sac"});
const annual = new Map<number, Decimal>();
for (const row of schedule.rows) { const year = 2026 + Math.floor((10 + row.period - 1) / 12); annual.set(year, (annual.get(year) ?? d(0)).plus(row.debtService)); }
md.push("", "### Serviço da dívida pedida e DSCR (financial-core; CDI 13,91% + 4,00%, 48 meses, 6 de carência, SAC; desembolso em novembro de 2026)", "", "| Ano | Serviço da nova dívida | EBITDA projetado | DSCR (EBITDA / serviço, proxy) |", "| --- | ---: | ---: | ---: |");
for (const [year, service] of [...annual.entries()].sort((a, b) => a[0] - b[0])) {
  const ebitda = projections.find((p) => p.year === year)?.ebitda ?? null;
  const partial = year === 2026 || year === 2030;
  md.push(`| ${year}${partial ? " (parcial)" : ""} | ${fmt(service)} | ${fmt(ebitda)} | ${ebitda && !partial ? x(calculateDscr(ebitda, service).value) : "n/a (ano parcial)"} |`);
}
md.push("", `Pico anual de serviço ${fmt(schedule.peakDebtService)} por período mensal máximo; juros totais ${fmt(schedule.totalInterest)}; vida média ${d(schedule.weightedAverageLifeMonths).toFixed(1)} meses. O serviço da dívida existente (mapa: ${fmt(mapTotal)}) não está incluído: os contratos não trazem cronograma, fica \`insufficient_evidence\`.`);

// 5. Sources and uses of the distribution center.
const usesCd = request.useOfProceeds.slice(1).reduce((sum, use) => sum + use.amount, 0);
const cdIdentity = checkIdentity({id: "cd.capex_vs_uses", left: project.capex, right: usesCd});
const totalUses = request.useOfProceeds.reduce((sum, use) => sum + use.amount, 0);
md.push("", "### Sources and uses", "", "| Uso | Valor |", "| --- | ---: |", ...request.useOfProceeds.map((use) => `| ${use.item} | ${fmt(use.amount)} |`), `| Total de usos | ${fmt(totalUses)} |`, `| Fonte: dívida pedida (plano) | ${fmt(request.amount)} |`, `| Fonte: dívida pedida (carta) | ${fmt(40_000_000)} |`);
md.push("", `Capex do memorial ${fmt(project.capex)} contra usos do CD ${fmt(usesCd)}: ${cdIdentity.status === "pass" ? "fecha" : "não fecha"}. Pedido do plano ${fmt(request.amount)} contra a carta ${fmt(40_000_000)}: diferença ${fmt(request.amount - 40_000_000)}, a perguntar.`);
console.log(md.join("\n"));
