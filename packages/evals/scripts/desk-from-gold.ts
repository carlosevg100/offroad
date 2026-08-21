/**
 * What the desk says about a gold case, given its answer key as the fact set.
 *
 * The extractor is measured elsewhere. This asks the next question: if every fact were read
 * perfectly, would the battery and the trajectory have what they need, and what would they
 * say? A gold case that the desk cannot analyse even from its own answer key is telling us
 * about the desk, not about the extractor.
 *
 *   pnpm --filter @offroad/evals desk:gold camil
 *   pnpm --filter @offroad/evals desk:gold camil -- --amount 800000000 --term 84 --grace 24 --refinancing 600000000
 *
 * The flags simulate a different ask on the same company: the desk's answer to "and if we
 * asked for less, longer, with more of it as a swap?" without touching the gold.
 */
import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

import {analyzeCreditPosition, buildDeskInputs, projectLeverageTrajectory, questionsForCompany, type Fact} from "@offroad/credit-analysis";

const args = process.argv.slice(2);
// A flag consumes the argument after it; everything else is positional (case id, reference date).
const positional = args.filter((arg, index) => !arg.startsWith("--") && !(index > 0 && args[index - 1]!.startsWith("--")));
const flag = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const caseId = positional[0] ?? "fakeco";
const referenceDate = positional[1] ?? "2026-08-21";
const overrides: Record<string, string | undefined> = {
  "transaction.requested_amount": flag("amount"),
  "transaction.desired_term_months": flag("term"),
  "transaction.desired_grace_months": flag("grace"),
  "transaction.refinancing": flag("refinancing"),
  "transaction.expected_rate": flag("rate"),
};
const goldDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "testing-fixtures", "gold", caseId);
const fields = JSON.parse(readFileSync(join(goldDir, "expected", "fields.json"), "utf8")) as Array<{fieldPath: string; value: string}>;
const overridden = new Set(Object.entries(overrides).filter(([, value]) => value !== undefined).map(([path]) => path));
const facts: Fact[] = [
  ...fields.filter((field) => !overridden.has(field.fieldPath)).map((field) => ({fieldPath: field.fieldPath, value: field.value})),
  ...[...overridden].map((path) => ({fieldPath: path, value: overrides[path]!})),
];
if (overridden.size > 0) console.log(`simulação: ${[...overridden].map((path) => `${path}=${overrides[path]}`).join(", ")}`);

const inputs = buildDeskInputs(facts, {referenceDate, indexLevels: {cdi: "0.105", tlp: "0.079", ipca: "0.045", tr: "0.002"}});
console.log(`${caseId}: ${facts.length} fatos; faltam para a mesa: ${inputs.missing.length ? inputs.missing.join(", ") : "nada"}`);
if (flag("debug") !== undefined) console.log(`debug: pedido ${JSON.stringify(inputs.desk?.request)}; nova dívida ${JSON.stringify(inputs.trajectory?.newDebt)}`);

const desk = inputs.desk ? analyzeCreditPosition(inputs.desk) : null;
const trajectory = inputs.trajectory ? projectLeverageTrajectory(inputs.trajectory) : null;

if (desk) {
  console.log(`\nestoque: ${desk.stack.lines.length} linhas, total ${desk.stack.totalSchedule}, balanço ${desk.stack.totalOnBalance}, gap ${desk.stack.scheduleGap}`);
  console.log(`custo médio ${desk.stack.weightedCost ?? "n/d"}, spread/CDI ${desk.stack.weightedSpreadOverCdi ?? "n/d"}, sem preço: ${desk.stack.unpriceableLines}, vence 24m ${desk.stack.maturingWithin24Months}`);
  console.log(`alavancagem pré ${desk.leverage.preTurns}; cenários: ${desk.leverage.scenarios.map((s) => `${s.source}=${s.postTurns}`).join(", ")}; covenant mais apertado ${desk.leverage.tightestCovenant ? `${desk.leverage.tightestCovenant.lender} ${desk.leverage.tightestCovenant.maximum}` : "nenhum"}; dívida nova admitida ${desk.leverage.maxNewDebtUnderCovenants ?? "n/d"}`);
  console.log(`ciclo: DSO ${desk.workingCapital.dso ?? "n/d"} DIO ${desk.workingCapital.dio ?? "n/d"} DPO ${desk.workingCapital.dpo ?? "n/d"} = ${desk.workingCapital.cycleDays ?? "n/d"} dias`);
  if (desk.runway) console.log(`perfil: ${desk.profile}; runway ${desk.runway.monthsPre} -> ${desk.runway.monthsPost} (${desk.runway.monthsPostAfterService} com serviço a ${desk.runway.assumedRate}); ARR ${desk.runway.arr ?? "n/d"}; dívida/ARR ${desk.runway.debtToArr ?? "n/d"}`);
  console.log(`\nleituras (${desk.findings.length}):`);
  for (const finding of desk.findings) console.log(`  [${finding.severity}] ${finding.id}: ${finding.pt}`);
}
if (trajectory) {
  console.log(`\ntrajetória: pico ${trajectory.peak.year} ${trajectory.peak.leverageBase} (cortado ${trajectory.peak.leverageStressed})`);
  for (const year of trajectory.years) console.log(`  ${year.year}  DL ${year.netDebt}  EBITDA ${year.ebitdaBase}  ${year.leverageBase}x / ${year.leverageStressed}x  principal ${year.principalDue}`);
  console.log(`covenant proposto: ${trajectory.covenantProposal.map((s) => `${s.year} ≤ ${s.maximum}`).join("; ")}`);
  if (trajectory.liabilityManagement) console.log(`gestão de passivo: quita ${trajectory.liabilityManagement.lendersTakenOut.join(", ")} (${trajectory.liabilityManagement.covenantedBalance}); novo dinheiro ${trajectory.liabilityManagement.netNewMoney}; pós ${trajectory.liabilityManagement.postLeverageAfterRefi}`);
  for (const finding of trajectory.findings) console.log(`  [${finding.severity}] ${finding.id}: ${finding.pt}`);
}
const questions = questionsForCompany(desk, trajectory, inputs.missing);
console.log(`\nperguntas (${questions.length}):`);
for (const question of questions) console.log(`  [${question.severity}] ${question.pt}`);
