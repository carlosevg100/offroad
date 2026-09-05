/**
 * Case 04 (Prisma analyst evaluating the Cogna proposal): the deterministic tables of its answer
 * key, from the Cogna gold (values read from the 2T26 release and the simulated request) and the
 * synthetic Prisma mandate, through the financial-core and the fund-mandate package.
 *
 *   pnpm --filter @offroad/evals gc04:tables
 */
import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

import {applyRateShock, buildDebtServiceSchedule, calculateAllInCost, calculateDscr, calculateLeverage, checkIdentity} from "@offroad/financial-core";
import {assessMandateFit, resolveMandate, type Mandate} from "@offroad/fund-mandate";
import Decimal from "decimal.js";

const here = dirname(fileURLToPath(import.meta.url));
const d = (value: Decimal.Value) => new Decimal(value);
const fmt = (value: Decimal.Value | null | undefined) => value === null || value === undefined ? "n/a" : d(value).toDecimalPlaces(0).toNumber().toLocaleString("pt-BR");
const x = (value: Decimal.Value | null | undefined) => value === null || value === undefined ? "n/a" : `${d(value).toFixed(2)}x`;
const pct = (value: Decimal.Value) => `${d(value).times(100).toFixed(2)}%`;

// Values of the Cogna gold (reais): release 2T26 and the simulated request. Sources: gold/cogna/expected/fields.json.
const release = {
  revenue3m: 1_960_700_000, revenue6m: 4_106_900_000, adjustedEbitda3m: 589_400_000, adjustedEbitda6m: 1_269_000_000,
  cash: 1_431_485_000, grossDebt: 3_926_827_000, netDebtReported: 2_775_379_000, leverageReported: "1.10", leases: 2_760_000_000,
  maturities: [["2026", 254_000_000], ["2027", 413_000_000], ["2028", 2_140_000_000], ["2029", 811_000_000], ["2030+", 309_000_000]] as const,
};
const request = {amount: 1_800_000_000, termMonths: 84, graceMonths: 36, rateOverCdi: 0.014, netDebtClaimed: 2_775_400_000, leverageClaimed: "1.10", upfrontFeeRate: 0.005};
const cdi = 0.1391;
const md: string[] = [];

// 1. Reconciliation proposal versus release, and the two definitions of net debt.
const netDebtGrossMinusCash = d(release.grossDebt).minus(release.cash);
const definitionGap = d(release.netDebtReported).minus(netDebtGrossMinusCash);
const claimVsRelease = checkIdentity({id: "proposal.net_debt_vs_release", left: request.netDebtClaimed, right: release.netDebtReported, absoluteTolerance: 100_000});
md.push("### Conciliação proposta versus release", "", "| Item | Proposta | Release | Estado |", "| --- | ---: | ---: | --- |",
  `| Dívida líquida | ${fmt(request.netDebtClaimed)} | ${fmt(release.netDebtReported)} (apurada pela companhia) | ${claimVsRelease.status === "pass" ? "concilia com a definição da companhia" : "não concilia"} |`,
  `| Dívida líquida, dívida bruta menos disponibilidades | | ${fmt(netDebtGrossMinusCash)} | difere da apurada por ${fmt(definitionGap)}: a definição da companhia não é bruta menos caixa e a proposta a copia |`,
  `| Alavancagem | ${request.leverageClaimed}x (conforme escrituras) | ${release.leverageReported}x | mesma definição, não aberta no release |`,
  `| Montante e uso | ${fmt(request.amount)} para resgatar as debêntures de 2028 | vencimentos de 2028: ${fmt(release.maturities[2][1])} | o pedido cobre 84% da parede de 2028 |`);

// 2. Leverage with the proposal's definition and with a market definition, side by side. LTM EBITDA is not in the base: the
//    six-month figure annualized is a declared proxy, never the covenant EBITDA.
const ebitdaProxy = d(release.adjustedEbitda6m).times(2);
const levCompany = calculateLeverage(release.netDebtReported, ebitdaProxy);
const levGrossMinusCash = calculateLeverage(netDebtGrossMinusCash, ebitdaProxy);
const levWithLeases = calculateLeverage(netDebtGrossMinusCash.plus(release.leases), ebitdaProxy);
md.push("", "### Alavancagem lado a lado (EBITDA ajustado 1S26 anualizado como proxy declarado, financial-core)", "", "| Definição | Dívida líquida | Índice |", "| --- | ---: | ---: |",
  `| Da companhia e da proposta (apurada, escrituras) | ${fmt(release.netDebtReported)} | ${x(levCompany.value)} (a companhia informa ${release.leverageReported}x sobre o EBITDA dos últimos doze meses, não aberto) |`,
  `| Bruta menos disponibilidades | ${fmt(netDebtGrossMinusCash)} | ${x(levGrossMinusCash.value)} |`,
  `| De mercado, com arrendamentos (IFRS 16) | ${fmt(netDebtGrossMinusCash.plus(release.leases))} | ${x(levWithLeases.value)} |`);

// 3. Debt service of the proposed debenture and DSCR proxy by year.
const schedule = buildDebtServiceSchedule({amount: request.amount, annualRate: cdi + request.rateOverCdi, rateConvention: "effective_annual", termMonths: request.termMonths, graceMonths: request.graceMonths, graceInterest: "paid", format: "sac"});
const annual = new Map<number, Decimal>();
for (const row of schedule.rows) { const year = 2026 + Math.floor((11 + row.period - 1) / 12); annual.set(year, (annual.get(year) ?? d(0)).plus(row.debtService)); }
md.push("", `### Serviço da debênture proposta (CDI 13,91% + 1,40%; 84 meses, 36 de carência, SAC; desembolso em dezembro de 2026) e DSCR proxy`, "", "| Ano | Serviço | EBITDA proxy | DSCR proxy |", "| --- | ---: | ---: | ---: |");
for (const [year, service] of [...annual.entries()].sort((a, b) => a[0] - b[0])) {
  const partial = year === 2026 || year === 2033;
  md.push(`| ${year}${partial ? " (parcial)" : ""} | ${fmt(service)} | ${fmt(ebitdaProxy)} | ${partial ? "n/a" : x(calculateDscr(ebitdaProxy, service).value)} |`);
}
md.push("", `Juros totais ${fmt(schedule.totalInterest)}; vida média ${d(schedule.weightedAverageLifeMonths).toFixed(1)} meses. O serviço da dívida remanescente (bruta ${fmt(release.grossDebt)} menos a parcela resgatada) não está no release por instrumento: fica \`insufficient_evidence\` e o DSCR acima é da nova dívida isolada, declarado como proxy.`);

// 4. Sensitivities: CDI +200 bp on the average balance; EBITDA -20%.
const shock = applyRateShock({averageBalance: d(request.amount).times("0.75"), baseRate: cdi + request.rateOverCdi, shock: "0.02"});
const worstYear = [...annual.entries()].filter(([year]) => year > 2026 && year < 2033).sort((a, b) => b[1].comparedTo(a[1]))[0]!;
const dscrStressed = calculateDscr(ebitdaProxy.times("0.8"), worstYear[1].plus(shock.delta));
md.push("", "### Sensibilidades (financial-core)", "", `CDI +200 pontos-base sobre saldo médio de ${fmt(d(request.amount).times("0.75"))}: juros de ${fmt(shock.baseInterest)} para ${fmt(shock.stressedInterest)} (delta ${fmt(shock.delta)} por ano). EBITDA -20% no ano de maior serviço (${worstYear[0]}: ${fmt(worstYear[1])}) com o choque: DSCR proxy ${x(dscrStressed.value)}.`);

// 5. All-in return of the proposed debenture for the fund.
const allIn = calculateAllInCost(String(cdi + request.rateOverCdi), String(request.upfrontFeeRate), String(request.termMonths / 12));
md.push("", `### Retorno all-in para o fundo`, "", `Cupom ${pct(cdi + request.rateOverCdi)} ao ano mais taxa de estruturação de ${pct(request.upfrontFeeRate)} amortizada em ${request.termMonths / 12} anos: all-in ${pct(allIn.value)} ao ano (CDI congelado do pack; a curva DI muda o número, não a leitura).`);

// 6. Mandate test.
const mandateFile = JSON.parse(readFileSync(join(here, "..", "..", "testing-fixtures", "assets", "prisma", "mandate.json"), "utf8")) as Mandate & {label: string};
const resolved = resolveMandate(mandateFile, {asOf: "2026-09-04"});
const fit = assessMandateFit(resolved, {amount: String(request.amount), termMonths: request.termMonths, sector: "educação", geography: "BR", instruments: ["debenture"], collateral: ["quirografario"], leverage: d(levGrossMinusCash.value).toFixed(2)});
md.push("", `### Teste do mandato (fund-mandate; ${mandateFile.fundName})`, "", `Veredito: **${fit.verdict}**. Divergências entre o que o fundo diz e faz: ${resolved.divergences.join("; ") || "nenhuma"}.`, "", "| Critério | Resultado | Mandato | Pedido | Explicação |", "| --- | --- | --- | --- | --- |");
for (const criterion of fit.criteria) md.push(`| ${criterion.id} | ${criterion.outcome}${criterion.hard ? " (eliminatório)" : ""}${criterion.divergent ? ", divergente" : ""} | ${criterion.mandate ?? ""} | ${criterion.request ?? ""} | ${criterion.explanation.pt} |`);
md.push("", `Desbloqueia: ${fit.unlockedBy.join("; ") || "nada"}. Lacunas nossas: ${fit.ourGaps.join(", ") || "nenhuma"}.`);
console.log(md.join("\n"));
