import fs from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";

import {Presentation, PresentationFile, SpreadsheetFile, Workbook} from "@oai/artifact-tool";

const workspaceDir = process.cwd();
const outDir = path.join(workspaceDir, "docs/product/reference-products/gc02");
const buildDir = path.join(workspaceDir, ".build/gc02-reference");
const skillDir = process.env.SKILL_DIR;
const runtimePython = process.env.RUNTIME_PYTHON;
if (!skillDir || !path.isAbsolute(skillDir) || !runtimePython || !path.isAbsolute(runtimePython)) {
  throw new Error("SKILL_DIR and RUNTIME_PYTHON must be absolute paths");
}
const snapshot = JSON.parse(await fs.readFile(path.join(outDir, "gc02-reference-snapshot.json"), "utf8"));
await fs.mkdir(outDir, {recursive: true});
await fs.mkdir(buildDir, {recursive: true});

const C = {ink: "#111820", navy: "#0E1824", olive: "#7D9455", oliveLight: "#EEF2E8", paper: "#FAFAF8", warm: "#F4F2ED", gray: "#69737E", line: "#DADDD8", blue: "#1F5A94", red: "#A8483E", amber: "#B27A2B", white: "#FFFFFF"};
const font = "Arial";
const serif = "Georgia";
const periods = snapshot.assumptions.periods;
const displayPeriods = periods.map((p) => p === "after 2031" ? "Após 2031" : p);
const moneyFmt = '#,##0;[Red](#,##0);-';
const pctFmt = '0.0%;[Red](0.0%);-';
const multipleFmt = '0.00x;[Red](0.00x);-';
const col = (n) => { let s = ""; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); } return s; };
const round = (v, d = 1) => Number(Number(v).toFixed(d));
const mm = (v) => Number(v) / 1000;
const fmtMm = (v, d = 1) => `R$ ${mm(v).toLocaleString("pt-BR", {minimumFractionDigits: d, maximumFractionDigits: d})} mi`;
const fmtX = (v) => `${Number(v).toLocaleString("pt-BR", {minimumFractionDigits: 2, maximumFractionDigits: 2})}x`;
const fmtPct = (v, d = 1) => `${(Number(v) * 100).toLocaleString("pt-BR", {minimumFractionDigits: d, maximumFractionDigits: d})}%`;

function styleSheet(sheet, usedRange = "A1:A1") {
  sheet.showGridLines = false;
  sheet.getRange(usedRange).format.font = {name: font, size: 10, color: C.ink};
  sheet.getRange(usedRange).format.verticalAlignment = "center";
}
function titleBand(sheet, title, subtitle, endCol = "H") {
  sheet.mergeCells(`A1:${endCol}1`);
  sheet.getRange("A1").values = [[title]];
  sheet.getRange(`A1:${endCol}1`).format = {fill: C.navy, font: {name: serif, size: 22, bold: true, color: C.white}, rowHeight: 38, verticalAlignment: "center"};
  sheet.mergeCells(`A2:${endCol}2`);
  sheet.getRange("A2").values = [[subtitle]];
  sheet.getRange(`A2:${endCol}2`).format = {fill: C.navy, font: {name: font, size: 9, color: "#CAD0D6"}, rowHeight: 26, wrapText: true};
}
function section(sheet, cell, text, endCol = null) {
  const start = cell.match(/[A-Z]+/)[0];
  const row = cell.match(/\d+/)[0];
  const range = endCol ? `${start}${row}:${endCol}${row}` : cell;
  if (endCol) sheet.mergeCells(range);
  sheet.getRange(cell).values = [[text]];
  sheet.getRange(range).format = {fill: C.oliveLight, font: {name: font, size: 10, bold: true, color: C.navy}, borders: {bottom: {style: "thin", color: C.olive}}};
}
function header(sheet, range) {
  sheet.getRange(range).format = {fill: C.navy, font: {name: font, size: 9, bold: true, color: C.white}, wrapText: true, borders: {preset: "all", style: "thin", color: C.line}, horizontalAlignment: "center"};
}
function inputStyle(sheet, range, numFmt = null) {
  sheet.getRange(range).format = {fill: "#EAF2FA", font: {name: font, size: 10, color: C.blue}, borders: {preset: "all", style: "thin", color: "#C8D8E8"}};
  if (numFmt) sheet.getRange(range).format.numberFormat = numFmt;
}
function formulaStyle(sheet, range, numFmt = null) {
  sheet.getRange(range).format.font = {name: font, size: 10, color: C.ink};
  if (numFmt) sheet.getRange(range).format.numberFormat = numFmt;
}

// ---------------- Workbook ----------------
const wb = Workbook.create();
const summary = wb.worksheets.add("Resumo");
const assumptions = wb.worksheets.add("Premissas");
const model = wb.worksheets.add("Modelo");
const debt = wb.worksheets.add("Divida");
const alternatives = wb.worksheets.add("Alternativas");
const sources = wb.worksheets.add("Fontes");
const checks = wb.worksheets.add("Checks");
for (const s of [summary, assumptions, model, debt, alternatives, sources, checks]) styleSheet(s);
summary.tabColor = C.olive; assumptions.tabColor = C.blue; model.tabColor = C.navy; debt.tabColor = C.navy; alternatives.tabColor = C.olive; sources.tabColor = C.gray; checks.tabColor = C.gray;

// Assumptions
titleBand(assumptions, "Premissas e cenários", "Uma única seleção controla o modelo. Células azuis são editáveis. Dados gerenciais são sintéticos.");
assumptions.getRange("A4").values = [["Cenário ativo"]];
assumptions.getRange("B4").values = [[snapshot.assumptions.activeCase]];
assumptions.getRange("B4").dataValidation = {rule: {type: "list", values: snapshot.assumptions.caseOptions}};
inputStyle(assumptions, "B4");
assumptions.getRange("A4:B4").format.rowHeight = 28;
assumptions.getRange("A6:H6").values = [["Driver", "Linha", ...displayPeriods]];
header(assumptions, "A6:H6");

const drivers = [
  ["Crescimento da receita", "revenueGrowth", pctFmt],
  ["Margem EBITDA", "ebitdaMargin", pctFmt],
  ["Impostos caixa", "cashTaxes", moneyFmt],
  ["Capex", "capex", moneyFmt],
  ["Variação do capital de giro", "workingCapitalChange", moneyFmt],
  ["Arrendamentos", "leases", moneyFmt],
  ["Dividendos", "dividends", moneyFmt],
  ["Parcela refinanciada", "refinancingShare", pctFmt],
  ["CDI", "cdi", pctFmt],
  ["IPCA", "ipca", pctFmt],
  ["SOFR", "sofr", pctFmt],
];
const activeRows = {};
let ar = 7;
for (const [label, key, nf] of drivers) {
  assumptions.getRange(`A${ar}:A${ar + 2}`).merge();
  assumptions.getRange(`A${ar}`).values = [[label]];
  assumptions.getRange(`B${ar}:B${ar + 2}`).values = [["Ativo"], ["Base"], ["Downside"]];
  assumptions.getRange(`C${ar}:H${ar}`).formulas = [periods.map((_, i) => `=IF($B$4="Base",${col(i + 3)}${ar + 1},${col(i + 3)}${ar + 2})`)];
  assumptions.getRange(`C${ar + 1}:H${ar + 1}`).values = [[...snapshot.assumptions.base[key]]];
  assumptions.getRange(`C${ar + 2}:H${ar + 2}`).values = [[...snapshot.assumptions.downside[key]]];
  formulaStyle(assumptions, `C${ar}:H${ar}`, nf);
  inputStyle(assumptions, `C${ar + 1}:H${ar + 2}`, nf);
  assumptions.getRange(`A${ar}:H${ar + 2}`).format.borders = {preset: "all", style: "thin", color: C.line};
  assumptions.getRange(`A${ar}`).format = {fill: C.paper, font: {name: font, bold: true, color: C.navy}, wrapText: true};
  assumptions.getRange(`B${ar}`).format.font = {name: font, bold: true, color: C.olive};
  activeRows[key] = ar;
  ar += 4;
}
assumptions.getRange(`A${ar}:H${ar}`).values = [["Custo da dívida refinanciada", "Ativo", ...periods.map(() => null)]];
for (let i = 0; i < periods.length; i++) assumptions.getRange(`${col(i + 3)}${ar}`).formulas = [[`=${col(i + 3)}${activeRows.cdi}+1.50%`]];
formulaStyle(assumptions, `C${ar}:H${ar}`, pctFmt);
assumptions.getRange(`A${ar}:H${ar}`).format.borders = {preset: "all", style: "thin", color: C.line};
assumptions.getRange(`A${ar}`).format.font = {name: font, bold: true};
activeRows.rolloverRate = ar;
ar += 3;
section(assumptions, `A${ar}`, "Fundamento das premissas", "H");
assumptions.getRange(`A${ar + 1}:D${ar + 1}`).values = [["Driver", "Base", "Downside", "Fundamento e limite"]];
header(assumptions, `A${ar + 1}:D${ar + 1}`);
assumptions.getRange(`A${ar + 2}`).write(snapshot.assumptions.rationale.map((x) => [x.driver, x.base, x.downside, x.basis]));
assumptions.getRange(`A${ar + 2}:D${ar + 1 + snapshot.assumptions.rationale.length}`).format = {wrapText: true, borders: {preset: "all", style: "thin", color: C.line}};
assumptions.getRange("A:A").format.columnWidth = 30; assumptions.getRange("B:B").format.columnWidth = 14; assumptions.getRange("C:H").format.columnWidth = 15; assumptions.getRange(`D${ar + 2}:D${ar + 1 + snapshot.assumptions.rationale.length}`).format.columnWidth = 48;
assumptions.freezePanes.freezeRows(6);

// Debt ledger and formula schedule
titleBand(debt, "Dívida por instrumento", "Principal contratual, remuneração, vencimentos e cálculo de serviço. Unidade: R$ mil.", "O");
const ledgerHeader = ["ID", "Instrumento", "Saldo contratual", "Moeda", "Vencimento", "Indexador", "Remuneração", "Fonte da taxa", "Garantia"];
debt.getRange("A4:I4").values = [ledgerHeader]; header(debt, "A4:I4");
debt.getRange("A5").write(snapshot.debt.series.map((x) => [x.id, x.label, x.balance, x.currency, x.maturity ?? "Não comprovado", x.indexer, x.rate, x.rateSource, x.guarantee]));
debt.getRange(`A5:I${4 + snapshot.debt.series.length}`).format = {borders: {preset: "all", style: "thin", color: C.line}, wrapText: true};
debt.getRange(`C5:C${4 + snapshot.debt.series.length}`).format.numberFormat = moneyFmt;
let dr = 6 + snapshot.debt.series.length;
section(debt, `A${dr}`, "Cronograma contratual e serviço da dívida", "O"); dr++;
const schedHeader = ["Período", "ID", "Instrumento", "Indexador", "Saldo inicial", "Taxa indexação", "Correção capitalizada", "Taxa cupom", "Juros caixa", "Principal contratual", "Principal caixa", "Saldo final", "Origem", "Tratamento", "Check"];
debt.getRange(`A${dr}:O${dr}`).values = [schedHeader]; header(debt, `A${dr}:O${dr}`);
const schedStart = dr + 1;
const allocation = new Map(snapshot.debt.contractualScheduleRows.map((x) => [`${x.seriesId}|${x.period}`, x.amount]));
const rateFormula = (s, pIndex) => {
  const c = col(pIndex + 3);
  if (s.indexer === "IPCA") return {idx: `='Premissas'!${c}${activeRows.ipca}`, coupon: `${Number(s.rate.match(/\+\s*([0-9.]+)%/)?.[1] ?? 0) / 100}`};
  if (s.indexer === "SOFR") return {idx: "=0", coupon: `='Premissas'!${c}${activeRows.sofr}+${Number(s.rate.match(/\+\s*([0-9.]+)%/)?.[1] ?? 0) / 100}`};
  if (s.indexer === "CDI" && s.rate.includes("% CDI")) return {idx: "=0", coupon: `='Premissas'!${c}${activeRows.cdi}*${Number(s.rate.match(/^([0-9.]+)%/)?.[1] ?? 100) / 100}`};
  if (s.indexer === "CDI") return {idx: "=0", coupon: `='Premissas'!${c}${activeRows.cdi}+${Number(s.rate.match(/\+\s*([0-9.]+)%/)?.[1] ?? 0) / 100}`};
  return {idx: "=0", coupon: `=${Number(s.rate.match(/^([0-9.]+)%/)?.[1] ?? 0) / 100}`};
};
let row = schedStart;
const firstRowBySeries = new Map();
for (const s of snapshot.debt.series) {
  firstRowBySeries.set(s.id, row);
  for (let pi = 0; pi < periods.length; pi++, row++) {
    const p = periods[pi];
    const rates = rateFormula(s, pi);
    debt.getRange(`A${row}:D${row}`).values = [[displayPeriods[pi], s.id, s.label, s.indexer]];
    debt.getRange(`E${row}`).formulas = [[pi === 0 ? `=C${4 + snapshot.debt.series.findIndex((x) => x.id === s.id) + 1}` : `=L${row - 1}`]];
    debt.getRange(`F${row}`).formulas = [[rates.idx]];
    debt.getRange(`G${row}`).formulas = [[`=E${row}*F${row}`]];
    debt.getRange(`H${row}`).formulas = [[rates.coupon]];
    debt.getRange(`I${row}`).formulas = [[`=(E${row}+G${row})*H${row}`]];
    debt.getRange(`J${row}`).values = [[allocation.get(`${s.id}|${p}`) ?? 0]];
    debt.getRange(`K${row}`).formulas = [[s.indexer === "IPCA" ? `=IF(J${row}>0,E${row}+G${row},0)` : `=J${row}`]];
    debt.getRange(`L${row}`).formulas = [[`=E${row}+G${row}-K${row}`]];
    debt.getRange(`M${row}:N${row}`).values = [[s.rateSource === "public" ? "SRC-03/SRC-07" : "SRC-04/SRC-07", s.indexer === "IPCA" ? "IPCA capitaliza; spread pago" : "Juros pagos; principal conforme cronograma"]];
    debt.getRange(`O${row}`).formulas = [[`=IF(ABS(L${row})<1,"OK",IF(L${row}<0,"ERRO","ABERTO"))`]];
  }
}
const schedEnd = row - 1;
debt.getRange(`A${schedStart}:O${schedEnd}`).format = {borders: {preset: "all", style: "thin", color: C.line}, wrapText: true};
debt.getRange(`E${schedStart}:E${schedEnd}`).format.numberFormat = moneyFmt;
debt.getRange(`G${schedStart}:G${schedEnd}`).format.numberFormat = moneyFmt;
debt.getRange(`I${schedStart}:L${schedEnd}`).format.numberFormat = moneyFmt;
debt.getRange(`F${schedStart}:H${schedEnd}`).format.numberFormat = pctFmt;
debt.getRange(`J${schedStart}:J${schedEnd}`).format.font = {name: font, color: C.blue};
debt.getRange(`F${schedStart}:H${schedEnd}`).format.font = {name: font, color: C.ink};
debt.freezePanes.freezeRows(dr);
debt.getRange("A:A").format.columnWidth = 14; debt.getRange("B:B").format.columnWidth = 14; debt.getRange("C:C").format.columnWidth = 34; debt.getRange("D:D").format.columnWidth = 14; debt.getRange("E:L").format.columnWidth = 15; debt.getRange("M:M").format.columnWidth = 18; debt.getRange("N:N").format.columnWidth = 38; debt.getRange("O:O").format.columnWidth = 12;

// Model
titleBand(model, "Modelo prospectivo de caixa e dívida", "Modelo preliminar controlado por premissas. O refinanciamento paga juros a partir do período seguinte e vence após o horizonte explícito.");
model.getRange("A4:G4").values = [["R$ mil, salvo indicadores", ...displayPeriods]]; header(model, "A4:G4");
const mrows = {};
const addModelRow = (label, formulaFn, nf = moneyFmt, bold = false) => {
  const r = 5 + Object.keys(mrows).length;
  mrows[label] = r;
  model.getRange(`A${r}`).values = [[label]];
  for (let i = 0; i < periods.length; i++) model.getRange(`${col(i + 2)}${r}`).formulas = [[formulaFn(i, r)]];
  model.getRange(`B${r}:G${r}`).format.numberFormat = nf;
  if (bold) model.getRange(`A${r}:G${r}`).format.font = {name: font, bold: true, color: C.navy};
  return r;
};
const asum = (key, i) => `'Premissas'!${col(i + 3)}${activeRows[key]}`;
const revenueR = addModelRow("Receita líquida", (i) => i === 0 ? `=SUM(${snapshot.budget.revenue.join(",")})` : `=${col(i + 1)}${mrows["Receita líquida"]}*(1+${asum("revenueGrowth", i)})`, moneyFmt, true);
const ebitdaR = addModelRow("EBITDA", (i) => `=${col(i + 2)}${revenueR}*${asum("ebitdaMargin", i)}`, moneyFmt, true);
addModelRow("Margem EBITDA", (i) => `=${col(i + 2)}${ebitdaR}/${col(i + 2)}${revenueR}`, pctFmt);
const taxR = addModelRow("Impostos caixa", (i) => `=${asum("cashTaxes", i)}`);
const capexR = addModelRow("Capex", (i) => `=${asum("capex", i)}`);
const wcR = addModelRow("Variação do capital de giro", (i) => `=${asum("workingCapitalChange", i)}`);
const cfadsR = addModelRow("CFADS antes do serviço da dívida", (i) => `=${col(i + 2)}${ebitdaR}-${col(i + 2)}${taxR}-${col(i + 2)}${capexR}-${col(i + 2)}${wcR}`, moneyFmt, true);
const legacyPrincipalR = addModelRow("Principal legado pago", (i) => `=SUMIFS('Divida'!$K$${schedStart}:$K$${schedEnd},'Divida'!$A$${schedStart}:$A$${schedEnd},${col(i + 2)}$4)`);
const legacyInterestR = addModelRow("Juros legados pagos", (i) => `=SUMIFS('Divida'!$I$${schedStart}:$I$${schedEnd},'Divida'!$A$${schedStart}:$A$${schedEnd},${col(i + 2)}$4)`);
const rolloverOpenR = addModelRow("Dívida refinanciada inicial", (i, r) => i === 0 ? "=0" : `=${col(i + 1)}${r + 3}`);
const rolloverInterestR = addModelRow("Juros da dívida refinanciada", (i) => `=${col(i + 2)}${rolloverOpenR}*${asum("rolloverRate", i)}`);
const refiR = addModelRow("Captação para refinanciamento", (i) => `=${col(i + 2)}${legacyPrincipalR}*${asum("refinancingShare", i)}`);
const rolloverCloseR = 5 + Object.keys(mrows).length;
addModelRow("Dívida refinanciada final", (i) => `=${col(i + 2)}${rolloverOpenR}+${col(i + 2)}${refiR}`, moneyFmt, true);
const leasesR = addModelRow("Arrendamentos", (i) => `=${asum("leases", i)}`);
const divR = addModelRow("Dividendos", (i) => `=${asum("dividends", i)}`);
const serviceR = addModelRow("Serviço total da dívida", (i) => `=${col(i + 2)}${legacyPrincipalR}+${col(i + 2)}${legacyInterestR}+${col(i + 2)}${rolloverInterestR}`, moneyFmt, true);
const usesR = addModelRow("Usos de caixa", (i) => `=${col(i + 2)}${serviceR}+${col(i + 2)}${leasesR}+${col(i + 2)}${divR}`, moneyFmt, true);
const openingCashR = addModelRow("Caixa inicial", (i, r) => i === 0 ? `=${snapshot.economicIdentity.accountingCashAndEquivalents}` : `=${col(i + 1)}${r + 2}`);
const sourcesR = addModelRow("Fontes de caixa", (i) => `=${col(i + 2)}${openingCashR}+${col(i + 2)}${cfadsR}+${col(i + 2)}${refiR}`, moneyFmt, true);
const closingCashR = 5 + Object.keys(mrows).length;
addModelRow("Caixa final", (i) => `=${col(i + 2)}${sourcesR}-${col(i + 2)}${usesR}`, moneyFmt, true);
const floorR = addModelRow("Piso de caixa", () => `=${snapshot.coverageGaps ? 900000 : 900000}`);
addModelRow("Folga ao piso", (i) => `=${col(i + 2)}${closingCashR}-${col(i + 2)}${floorR}`, moneyFmt, true);
addModelRow("Cobertura de liquidez", (i) => `=${col(i + 2)}${sourcesR}/${col(i + 2)}${usesR}`, multipleFmt, true);
addModelRow("DSCR", (i) => `=${col(i + 2)}${cfadsR}/${col(i + 2)}${serviceR}`, multipleFmt, true);
const legacyCloseR = addModelRow("Dívida legada final", (i) => `=SUMIFS('Divida'!$L$${schedStart}:$L$${schedEnd},'Divida'!$A$${schedStart}:$A$${schedEnd},${col(i + 2)}$4)`);
const grossR = addModelRow("Dívida bruta final", (i) => `=${col(i + 2)}${legacyCloseR}+${col(i + 2)}${rolloverCloseR}`, moneyFmt, true);
const netR = addModelRow("Dívida líquida final", (i) => `=${col(i + 2)}${grossR}-${col(i + 2)}${closingCashR}`, moneyFmt, true);
addModelRow("Alavancagem líquida", (i) => `=${col(i + 2)}${netR}/${col(i + 2)}${ebitdaR}`, multipleFmt, true);
model.getRange(`A5:G${4 + Object.keys(mrows).length}`).format.borders = {preset: "all", style: "thin", color: C.line};
model.getRange(`A5:A${4 + Object.keys(mrows).length}`).format.columnWidth = 38;
model.getRange("B:G").format.columnWidth = 16;
model.getRange(`A${cfadsR}:G${cfadsR}`).format.fill = C.oliveLight;
model.getRange(`A${closingCashR}:G${closingCashR}`).format.fill = C.oliveLight;
model.freezePanes.freezeRows(4); model.freezePanes.freezeColumns(1);

// Summary
titleBand(summary, "Estrutura de capital para discussão com o Conselho", `${snapshot.company} | data-base ${snapshot.asOf} | mercado ${snapshot.marketAsOf} | ${snapshot.unit}`);
summary.mergeCells("A4:H5");
summary.getRange("A4").values = [["Mesmo com refinanciamento integral do principal, o cenário-base sintético perde o piso de caixa em 2027/28 e fica com caixa negativo em 2030/31. O custo e o perfil da nova dívida precisam entrar na decisão."]];
summary.getRange("A4:H5").format = {fill: C.oliveLight, font: {name: serif, size: 16, bold: true, color: C.navy}, wrapText: true, borders: {left: {style: "thick", color: C.olive}}};
summary.getRange("A7:H7").values = [["Indicador", "Atual", ...displayPeriods]]; header(summary, "A7:H7");
const sumRows = [
  ["Dívida bruta contratual", snapshot.economicIdentity.contractualGrossPrincipal, ...periods.map((_, i) => `='Modelo'!${col(i + 2)}${grossR}`)],
  ["Caixa", snapshot.economicIdentity.accountingCashAndEquivalents, ...periods.map((_, i) => `='Modelo'!${col(i + 2)}${closingCashR}`)],
  ["Dívida líquida", snapshot.economicIdentity.contractualNetDebt, ...periods.map((_, i) => `='Modelo'!${col(i + 2)}${netR}`)],
  ["Alavancagem líquida", snapshot.economicIdentity.companyReportedProFormaLeverage, ...periods.map((_, i) => `='Modelo'!${col(i + 2)}${mrows["Alavancagem líquida"]}`)],
  ["Cobertura de liquidez", null, ...periods.map((_, i) => `='Modelo'!${col(i + 2)}${mrows["Cobertura de liquidez"]}`)],
  ["DSCR", null, ...periods.map((_, i) => `='Modelo'!${col(i + 2)}${mrows.DSCR}`)],
];
for (let i = 0; i < sumRows.length; i++) {
  const rr = 8 + i; const vals = sumRows[i];
  summary.getRange(`A${rr}:B${rr}`).values = [[vals[0], vals[1]]];
  summary.getRange(`C${rr}:H${rr}`).formulas = [[...vals.slice(2)]];
}
summary.getRange("A8:H13").format.borders = {preset: "all", style: "thin", color: C.line};
summary.getRange("B8:H10").format.numberFormat = moneyFmt; summary.getRange("B11:H13").format.numberFormat = multipleFmt;
summary.getRange("A15:D15").values = [["Alternativa", "Estado", "Pergunta para o Conselho", "Condição antes de avançar"]]; header(summary, "A15:D15");
summary.getRange("A16").write(snapshot.options.map((x) => [x.label, x.state === "reference_only" ? "Referência" : "Bloqueada", x.boardQuestion, x.condition]));
summary.getRange(`A16:D${15 + snapshot.options.length}`).format = {wrapText: true, borders: {preset: "all", style: "thin", color: C.line}};
summary.getRange("A:A").format.columnWidth = 32; summary.getRange("B:B").format.columnWidth = 16; summary.getRange("C:D").format.columnWidth = 44; summary.getRange("E:H").format.columnWidth = 16;
summary.freezePanes.freezeRows(7);

// Alternatives
titleBand(alternatives, "Alternativas para decisão", "Portfólio preliminar. Nenhuma alternativa está recomendada ou ranqueada antes dos dados bloqueantes.", "E");
alternatives.getRange("A4:E4").values = [["Alternativa", "Estado", "Tese", "Pergunta para o Conselho", "Condição antes de avançar"]]; header(alternatives, "A4:E4");
alternatives.getRange("A5").write(snapshot.options.map((x) => [x.label, x.state === "reference_only" ? "Referência" : "Bloqueada", x.id === "status_quo" ? "Mantém acesso, mas concentra dependência de execução e custo futuro" : "Pode redistribuir vencimentos ou reduzir dívida, sujeito à economia completa", x.boardQuestion, x.condition]));
alternatives.getRange(`A5:E${4 + snapshot.options.length}`).format = {wrapText: true, borders: {preset: "all", style: "thin", color: C.line}};
section(alternatives, "A12", "Lacunas que impedem recomendação", "E");
alternatives.getRange("A13:E13").values = [["ID", "Materialidade", "Tema", "Informação ausente", "Consequência"]]; header(alternatives, "A13:E13");
alternatives.getRange("A14").write(snapshot.coverageGaps.map((x) => [x.id, x.materiality, x.topic, x.missing, x.consequence]));
alternatives.getRange(`A14:E${13 + snapshot.coverageGaps.length}`).format = {wrapText: true, borders: {preset: "all", style: "thin", color: C.line}};
alternatives.getRange("A:A").format.columnWidth = 28; alternatives.getRange("B:B").format.columnWidth = 16; alternatives.getRange("C:C").format.columnWidth = 28; alternatives.getRange("D:E").format.columnWidth = 48;

// Sources
titleBand(sources, "Fontes e rastreabilidade", "Cada fonte informa classe, data-base, uso e âncora. Informações sintéticas não são apresentadas como dados da companhia.", "G");
sources.getRange("A4:G4").values = [["ID", "Fonte", "Arquivo", "Data-base", "Classe", "Uso", "Âncora"]]; header(sources, "A4:G4");
sources.getRange("A5").write(snapshot.sources.map((x) => [x.id, x.title, x.file, x.asOf, x.class, x.use, x.anchor]));
sources.getRange(`A5:G${4 + snapshot.sources.length}`).format = {wrapText: true, borders: {preset: "all", style: "thin", color: C.line}};
sources.getRange("A:A").format.columnWidth = 12; sources.getRange("B:B").format.columnWidth = 28; sources.getRange("C:C").format.columnWidth = 38; sources.getRange("D:E").format.columnWidth = 18; sources.getRange("F:G").format.columnWidth = 38;

// Checks
titleBand(checks, "Checks terminais", "Estes controles observam o modelo e não alimentam qualquer resultado.", "D");
checks.getRange("A4:D4").values = [["Check", "Resultado", "Tolerância", "Leitura"]]; header(checks, "A4:D4");
const checksRows = [
  ["Ponte contábil", `=${snapshot.economicIdentity.contractualGrossPrincipal}${snapshot.economicIdentity.accountingToContractualBridge.loanTransactionCosts}${snapshot.economicIdentity.accountingToContractualBridge.debentureBalanceTransactionCosts}-${snapshot.economicIdentity.accountingGrossDebt}`, 0, "zero"],
  ["Cronograma contratual", `=SUM('Divida'!$J$${schedStart}:$J$${schedEnd})-${snapshot.economicIdentity.contractualGrossPrincipal}`, 0, "zero"],
  ["Saldo final por série", `=SUMIFS('Divida'!$L$${schedStart}:$L$${schedEnd},'Divida'!$A$${schedStart}:$A$${schedEnd},"Após 2031")`, 1, "zero após último período"],
  ["Caixa 2026/27 vs snapshot", `='Modelo'!B${closingCashR}-${snapshot.projections.rollover[0].closingCash}`, 1, "zero"],
  ["Caixa 2030/31 vs snapshot", `='Modelo'!F${closingCashR}-${snapshot.projections.rollover[4].closingCash}`, 1, "zero"],
  ["Alavancagem 2030/31 vs snapshot", `='Modelo'!F${mrows["Alavancagem líquida"]}-${snapshot.projections.rollover[4].leverage}`, 0.01, "zero"],
];
for (let i = 0; i < checksRows.length; i++) {
  const rr = 5 + i; checks.getRange(`A${rr}`).values = [[checksRows[i][0]]]; checks.getRange(`B${rr}`).formulas = [[checksRows[i][1]]]; checks.getRange(`C${rr}:D${rr}`).values = [[checksRows[i][2], checksRows[i][3]]];
}
checks.getRange("A5:D10").format.borders = {preset: "all", style: "thin", color: C.line}; checks.getRange("B5:C10").format.numberFormat = "0.000";
checks.getRange("B5:B10").conditionalFormats.add("cellIs", {operator: "between", formula: [-1, 1], format: {fill: "#E9F5E7", font: {color: "#2E6B2E", bold: true}}});
checks.getRange("A12:D12").values = [["Limite", "Estado", "Motivo", "Ação"]]; header(checks, "A12:D12");
checks.getRange("A13:D16").values = [
  ["Covenant prospectivo", "Não calculável", "definições contratuais incompletas", "obter memória de cálculo e degraus"],
  ["Custo de saída", "Não calculável", "pré-pagamento e prêmio não comprovados", "obter bases de liquidação"],
  ["Preço de nova dívida", "Cenário", "curva DI futura e spread executável ausentes", "atualizar mercado e sondagem"],
  ["Recomendação", "Bloqueada", "economia comparável incompleta", "fechar gaps antes de ranquear"],
];
checks.getRange("A13:D16").format = {wrapText: true, borders: {preset: "all", style: "thin", color: C.line}};
checks.getRange("A:A").format.columnWidth = 32; checks.getRange("B:B").format.columnWidth = 18; checks.getRange("C:D").format.columnWidth = 42;

wb.recalculate();
const xlsxPath = path.join(outDir, "GC02_Camil_Modelo_Conselho_v1.xlsx");
await (await SpreadsheetFile.exportXlsx(wb)).save(xlsxPath);
for (const s of ["Resumo", "Premissas", "Modelo", "Divida", "Alternativas", "Fontes", "Checks"]) {
  const image = await wb.render({sheetName: s, autoCrop: "all", scale: 1, format: "png"});
  await fs.writeFile(path.join(buildDir, `xlsx-${s}.png`), new Uint8Array(await image.arrayBuffer()));
}
const formulaErrors = await wb.inspect({kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: {useRegex: true, maxResults: 200}, maxChars: 12000});
await fs.writeFile(path.join(buildDir, "xlsx-formula-errors.ndjson"), formulaErrors.ndjson ?? "");

// ---------------- Presentation ----------------
const pres = Presentation.create({slideSize: {width: 1280, height: 720}});
const logoPath = path.join(workspaceDir, "apps/web/public/brand/offroad-lockup-inverted.png");
const logoData = `data:image/png;base64,${(await fs.readFile(logoPath)).toString("base64")}`;
const addText = (slide, text, left, top, width, height, style = {}) => {
  const box = slide.shapes.add({geometry: "textbox", position: {left, top, width, height}, fill: style.fill ?? "none", line: style.line ?? {fill: "none", width: 0}});
  box.text = text;
  box.text.style = {typeface: style.typeface ?? font, fontSize: style.fontSize ?? 18, bold: style.bold ?? false, color: style.color ?? C.ink, autoFit: style.autoFit ?? "shrinkText", alignment: style.alignment ?? "left", verticalAlignment: style.verticalAlignment ?? "top"};
  return box;
};
const addBase = (slide, title, num) => {
  slide.background.fill = C.paper;
  addText(slide, "OFFROAD  |  ESTRUTURA DE CAPITAL", 64, 28, 600, 24, {fontSize: 11, bold: true, color: C.olive});
  addText(slide, title, 64, 64, 1120, 62, {fontSize: 34, bold: true, color: C.navy, typeface: serif});
  addText(slide, String(num).padStart(2, "0"), 1180, 32, 36, 20, {fontSize: 10, color: C.gray, alignment: "right"});
  addText(slide, `${snapshot.company} | ${snapshot.asOf} | R$ milhões`, 64, 680, 760, 18, {fontSize: 10, color: C.gray});
  addText(slide, "Fixture sintética para validação da plataforma", 830, 680, 386, 18, {fontSize: 10, color: C.gray, alignment: "right"});
};
const styleTable = (table, headerRows = 1, fontSize = 12) => {
  table.borders.assign({style: "solid", fill: C.line, width: 1});
  table.cells.block({row: 0, column: 0, rowCount: headerRows, columnCount: table.columns.length}).assign({fill: C.navy, textStyle: {typeface: font, fontSize, bold: true, color: C.white}, margins: 8, anchor: "middle"});
  if (table.rows.length > headerRows) table.cells.block({row: headerRows, column: 0, rowCount: table.rows.length - headerRows, columnCount: table.columns.length}).assign({fill: C.white, textStyle: {typeface: font, fontSize, color: C.ink}, margins: 8, anchor: "middle"});
  for (let r = 0; r < table.rows.length; r++) {
    for (let c = 0; c < table.columns.length; c++) {
      table.getCell(r, c).text.style = {typeface: font, fontSize, bold: r < headerRows, color: r < headerRows ? C.white : C.ink, autoFit: "shrinkText"};
    }
  }
};
const addNotes = (slide, sourcesList) => slide.speakerNotes.textFrame.setText(`Fontes e limites:\n${sourcesList.join("\n")}`);

// 1 Cover
{
  const s = pres.slides.add(); s.background.fill = C.navy;
  s.images.add({dataUrl: logoData, position: {left: 66, top: 54, width: 250, height: 84}});
  addText(s, "Estrutura de capital\npara discussão com o Conselho", 70, 218, 920, 150, {fontSize: 48, bold: true, color: C.white, typeface: serif});
  addText(s, "Camil Alimentos S.A.", 72, 392, 650, 38, {fontSize: 24, color: "#D8DEE5"});
  addText(s, `Data-base ${snapshot.asOf} | Mercado ${snapshot.marketAsOf}`, 72, 445, 680, 26, {fontSize: 15, color: "#AAB3BD"});
  addText(s, "Material de referência produzido a partir de dados públicos e fixtures gerenciais sintéticas. Não constitui recomendação, oferta ou decisão.", 72, 600, 1010, 52, {fontSize: 14, color: "#CBD2D8"});
  addText(s, "01", 1180, 668, 36, 18, {fontSize: 10, color: "#86919C", alignment: "right"});
  addNotes(s, ["Snapshot governado: " + snapshot.fingerprint, snapshot.disclosure]);
}
// 2 Decision boundary
{
  const s = pres.slides.add(); addBase(s, "A decisão ainda depende de dados que mudam a economia", 2);
  addText(s, "O diagnóstico atual sustenta uma discussão sobre liquidez e perfil de vencimentos. Ainda não sustenta ranking, sizing ou termos finais.", 64, 136, 1130, 46, {fontSize: 20, color: C.gray});
  const t = s.tables.add({rows: 5, columns: 3, left: 64, top: 210, width: 1152, height: 350, columnWidths: [270, 350, 532], values: [
    ["Camada", "O que está sustentado", "Limite material"],
    ["Fatos públicos", "Dívida, caixa, vencimentos e remuneração por série", "Cronograma público mistura bases contábeis"],
    ["Dados gerenciais", "Orçamento, capex, caixa mínimo e cronograma contratual", "Todos são sintéticos nesta fixture"],
    ["Cenários", "Rollover, caixa, cobertura, DSCR e alavancagem", "Preço futuro e execução não são observados"],
    ["Decisão", "Questões e alternativas para orientar o Conselho", "Covenants, saída e tributos bloqueiam recomendação"],
  ]}); styleTable(t);
  addText(s, "Regra do material", 64, 590, 250, 24, {fontSize: 13, bold: true, color: C.olive});
  addText(s, "Todo número mantém unidade, período, estado de evidência e caminho até a fonte ou premissa.", 64, 618, 900, 34, {fontSize: 18, color: C.navy});
  addNotes(s, ["SRC-01 a SRC-08. Ver aba Fontes do Excel.", snapshot.disclosure]);
}
// 3 Current capital structure
{
  const s = pres.slides.add(); addBase(s, "Dívida contratual de R$ 5,74 bi combina bancos e quatro perfis de debêntures", 3);
  const mix = snapshot.debt.mix;
  const chart = s.charts.add("doughnut", {position: {left: 60, top: 150, width: 590, height: 430}, categories: mix.map((x) => x.label), series: [{name: "Principal", values: mix.map((x) => mm(x.amount)), points: [{idx: 0, fill: C.navy}, {idx: 1, fill: C.olive}, {idx: 2, fill: "#A9B892"}, {idx: 3, fill: C.gray}]}], doughnutOptions: {holeSize: 66}, hasLegend: true, legend: {position: "bottom", textStyle: {typeface: font, fontSize: 12, fill: C.gray}}, dataLabels: {showPercent: true, position: "outEnd", textStyle: {typeface: font, fontSize: 12, bold: true, fill: C.navy}}, chartFill: C.paper, chartLine: {fill: "none", width: 0}});
  const metrics = [
    ["Principal contratual", fmtMm(snapshot.economicIdentity.contractualGrossPrincipal)],
    ["Dívida contábil", fmtMm(snapshot.economicIdentity.accountingGrossDebt)],
    ["Caixa operacional", fmtMm(snapshot.economicIdentity.accountingCashAndEquivalents)],
    ["Dívida líquida contratual", fmtMm(snapshot.economicIdentity.contractualNetDebt)],
    ["Alavancagem divulgada pro forma", fmtX(snapshot.economicIdentity.companyReportedProFormaLeverage)],
  ];
  let y = 162;
  for (const [label, value] of metrics) {
    addText(s, label, 725, y, 430, 22, {fontSize: 13, color: C.gray});
    addText(s, value, 725, y + 20, 430, 40, {fontSize: 28, bold: true, color: C.navy, typeface: serif});
    y += 82;
  }
  addText(s, "4,72x é indicador divulgado pela companhia e não foi recomputado sem a definição contratual integral.", 725, 585, 440, 48, {fontSize: 13, color: C.red});
  addNotes(s, ["SRC-01, nota 15, pp. 39-40; SRC-02, p. 12.", "Dívida contratual exclui custos de transação. 4,72x permanece company_reported_not_recomputed."]);
}
// 4 Maturities
{
  const s = pres.slides.add(); addBase(s, "O cronograma exige refinanciamento já em 2026/27 e volta a subir em 2028/29", 4);
  const values = snapshot.debt.grossContractualSchedule.map((x) => mm(x.amount));
  s.charts.add("bar", {position: {left: 60, top: 150, width: 720, height: 390}, categories: displayPeriods, series: [{name: "Principal contratual", values, fill: C.navy}], barOptions: {direction: "column", grouping: "clustered", gapWidth: 55}, hasLegend: false, xAxis: {textStyle: {typeface: font, fontSize: 11, fill: C.gray}, line: {fill: C.line, width: 1}}, yAxis: {numberFormatCode: "0.0", min: 0, majorGridlines: {fill: C.line, width: 1}, textStyle: {typeface: font, fontSize: 11, fill: C.gray}}, dataLabels: {showValue: true, position: "outEnd", textStyle: {typeface: font, fontSize: 11, bold: true, fill: C.navy}}, chartFill: C.paper, chartLine: {fill: "none", width: 0}});
  const t = s.tables.add({rows: 7, columns: 2, left: 835, top: 160, width: 350, height: 320, columnWidths: [190, 160], values: [["Período", "R$ mi"], ...snapshot.debt.grossContractualSchedule.map((x, i) => [displayPeriods[i], round(mm(x.amount), 1)])]}); styleTable(t);
  addText(s, "Ponte para o cronograma público", 835, 510, 350, 22, {fontSize: 13, bold: true, color: C.olive});
  addText(s, "Custos de transação nas linhas: R$ 9,1 mi. Custos das debêntures no cronograma: R$ 63,2 mi.", 835, 538, 350, 72, {fontSize: 16, color: C.navy});
  addNotes(s, ["SRC-01, nota 15, p. 40; SRC-07, aba Cronograma.", "O cronograma contratual é sintético e reconcilia ao cronograma público após a ponte de custos."]);
}
// 5 Prospective liquidity
{
  const s = pres.slides.add(); addBase(s, "Rollover integral preserva caixa no curto prazo, mas a cobertura cai abaixo de 1,0x", 5);
  const pr = snapshot.projections.rollover;
  s.charts.add("line", {position: {left: 58, top: 150, width: 760, height: 360}, categories: displayPeriods, series: [{name: "Cobertura de liquidez", values: pr.map((x) => round(x.liquidityCoverage, 3)), line: {fill: C.navy, width: 4}, marker: {symbol: "circle", size: 8}, dataLabelOverrides: pr.map((x, idx) => ({idx, text: `${round(x.liquidityCoverage, 2).toFixed(2)}x`, position: "outEnd", textStyle: {typeface: font, fontSize: 11, bold: true, fill: C.navy}}))}, {name: "Referência 1,0x", values: periods.map(() => 1), line: {fill: C.red, width: 2, dash: "dash"}, marker: {symbol: "none"}}], hasLegend: true, legend: {position: "bottom", textStyle: {typeface: font, fontSize: 11, fill: C.gray}}, xAxis: {textStyle: {typeface: font, fontSize: 11, fill: C.gray}}, yAxis: {numberFormatCode: "0.00x", min: 0.5, max: 1.6, majorUnit: 0.2, majorGridlines: {fill: C.line, width: 1}, textStyle: {typeface: font, fontSize: 11, fill: C.gray}}, chartFill: C.paper, chartLine: {fill: "none", width: 0}});
  const t = s.tables.add({rows: 7, columns: 3, left: 850, top: 150, width: 335, height: 340, columnWidths: [125, 105, 105], values: [["Período", "DSCR", "Liq."], ...pr.map((x, i) => [displayPeriods[i], round(x.dscr, 2), round(x.liquidityCoverage, 2)])]}); styleTable(t);
  addText(s, "O custo da rolagem importa", 64, 540, 300, 24, {fontSize: 13, bold: true, color: C.olive});
  addText(s, "A dívida refinanciada paga CDI + 1,50% no cenário e acumula ao longo do horizonte. Refinanciar principal não elimina o serviço futuro.", 64, 570, 1070, 62, {fontSize: 19, color: C.navy});
  addNotes(s, ["SRC-04 a SRC-08; cenário Offroad Base.", "Rollover: 100% do principal. Custo: CDI spot de 13,91% + 1,50%. Dívida nova bullet após o horizonte."]);
}
// 6 Rollover insufficient
{
  const s = pres.slides.add(); addBase(s, "Caixa fica negativo em 2030/31 e a alavancagem alcança 6,77x", 6);
  const pr = snapshot.projections.rollover;
  s.charts.add("line", {position: {left: 55, top: 150, width: 590, height: 380}, categories: displayPeriods, series: [{name: "Caixa final", values: pr.map((x) => round(mm(x.closingCash), 1)), line: {fill: C.navy, width: 4}, marker: {symbol: "circle", size: 7}}, {name: "Piso de caixa", values: periods.map(() => 900), line: {fill: C.red, width: 2}, marker: {symbol: "none"}}], hasLegend: true, legend: {position: "bottom", textStyle: {typeface: font, fontSize: 11, fill: C.gray}}, yAxis: {numberFormatCode: "0", majorGridlines: {fill: C.line, width: 1}, textStyle: {typeface: font, fontSize: 11, fill: C.gray}}, xAxis: {textStyle: {typeface: font, fontSize: 10, fill: C.gray}}, chartFill: C.paper, chartLine: {fill: "none", width: 0}});
  s.charts.add("line", {position: {left: 690, top: 150, width: 500, height: 380}, categories: displayPeriods, series: [{name: "Alavancagem líquida", values: pr.map((x) => round(x.leverage, 3)), line: {fill: C.olive, width: 4}, marker: {symbol: "circle", size: 7}}], hasLegend: false, yAxis: {numberFormatCode: "0.0x", min: 5, max: 7.2, majorUnit: 0.5, majorGridlines: {fill: C.line, width: 1}, textStyle: {typeface: font, fontSize: 11, fill: C.gray}}, xAxis: {textStyle: {typeface: font, fontSize: 10, fill: C.gray}}, dataLabels: {showValue: true, position: "outEnd", textStyle: {typeface: font, fontSize: 10, bold: true, fill: C.olive}}, chartFill: C.paper, chartLine: {fill: "none", width: 0}});
  addText(s, "O cenário não autoriza concluir qual estrutura resolve o problema. Ele demonstra que prazo, custo, amortização, capex, dividendos e desempenho operacional precisam ser avaliados em conjunto.", 64, 560, 1120, 72, {fontSize: 19, color: C.navy});
  addNotes(s, ["Modelo determinístico do Excel e snapshot governado.", "A alavancagem projetada não equivale ao covenant contratual. Usa dívida líquida contratual e EBITDA do cenário."]);
}
// 7 Gaps
{
  const s = pres.slides.add(); addBase(s, "Seis lacunas materiais impedem uma recomendação de estrutura", 7);
  const gapRows = [
    ["Bloqueante", "Covenant prospectivo", "Definição de EBITDA, ajustes, caixa e degrau", "Headroom e cumprimento"],
    ["Bloqueante", "Custo de saída", "Principal, juros, encargos e pré-pagamento", "Ranking de retirada de dívida"],
    ["Alta", "Curva de juros", "Curva DI futura e hedge por instrumento", "Juros prospectivos como preço"],
    ["Alta", "Modelo integrado", "Histórico por linha e projeções integradas", "Balanço e fluxo de caixa completos"],
    ["Alta", "Tributos", "Regime tributário e efeitos da reforma", "Comparação após impostos"],
    ["Alta", "Liquidez intraperíodo", "Sazonalidade mensal e disponibilidade D0", "Picos de liquidez"],
  ];
  const t = s.tables.add({rows: 7, columns: 4, left: 64, top: 182, width: 1152, height: 390, columnWidths: [150, 210, 470, 322], values: [["Materialidade", "Tema", "Informação ausente", "O que fica bloqueado"], ...gapRows]}); styleTable(t, 1, 9);
  addNotes(s, ["Coverage map do GC-02.", "Nenhuma lacuna foi preenchida por inferência."]);
}
// 8 Options
{
  const s = pres.slides.add(); addBase(s, "As alternativas organizam a discussão, mas ainda não podem ser ranqueadas", 8);
  const optionRows = [
    ["Manter estrutura e rolar linhas", "Referência", "A companhia aceita rolagem integral nos anos de menor folga?", "Capacidade, preço e prazo ainda não contratados"],
    ["Alongar o pico de 2028/29", "Bloqueada", "A redução do pico compensa custo e menor flexibilidade?", "Base de liquidação e saída da 13ª 1ª série"],
    ["Alongar os picos de 2028/29 e 2029/30", "Bloqueada", "Uma transação maior reduz execução sem concentrar preço e covenants?", "Liquidação e saída da 13ª 1ª e 14ª 1ª séries"],
    ["Amortizar linhas com caixa", "Bloqueada", "Qual caixa excede o piso e qual é o custo de pré-pagamento?", "Pré-pagamento e liquidez das aplicações"],
    ["Oferta de resgate da 11ª emissão", "Bloqueada", "Existe adesão econômica para uma saída negociada?", "Prêmio e adesão de 100% da série"],
  ];
  const t = s.tables.add({rows: 6, columns: 4, left: 55, top: 150, width: 1170, height: 420, columnWidths: [245, 160, 385, 380], values: [["Alternativa", "Estado", "Pergunta para o Conselho", "Condição antes de avançar"], ...optionRows]}); styleTable(t, 1, 9);
  addNotes(s, ["Opções do snapshot GC-02.", "Estados reference_only e blocked. Não há recomendação ou ranking."]);
}
// 9 Board framework
{
  const s = pres.slides.add(); addBase(s, "O Conselho precisa escolher a tolerância ao risco antes de definir a transação", 9);
  const t = s.tables.add({rows: 6, columns: 3, left: 64, top: 150, width: 1152, height: 360, columnWidths: [250, 490, 412], values: [
    ["Decisão", "Questão", "Informação que fecha a análise"],
    ["Liquidez", "Qual caixa mínimo e qual folga mensal são aceitáveis?", "Caixa D0, sazonalidade e linhas comprometidas"],
    ["Perfil", "Quanto risco de refinanciamento a companhia aceita?", "Apetite por prazo, amortização e indexador"],
    ["Flexibilidade", "Quais planos operacionais não podem ser restringidos?", "Capex, M&A, dividendos e garantias"],
    ["Economia", "Qual custo total justifica retirar ou alongar dívida?", "Preço, saída, tributos e hedge"],
    ["Execução", "Qual rota oferece maior probabilidade de fechamento?", "Rating, mandato, investidores e cronograma"],
  ]}); styleTable(t);
  addText(s, "Próximo passo de trabalho", 64, 545, 300, 24, {fontSize: 13, bold: true, color: C.olive});
  addText(s, "Fechar as seis lacunas, recalcular Base e Downside, comparar as alternativas na mesma métrica e preparar o material no template definitivo da companhia.", 64, 578, 1100, 66, {fontSize: 21, color: C.navy, typeface: serif});
  addNotes(s, ["Framework de decisão Offroad para o GC-02.", "Offroad apoia análise, estruturação e conexão. Diligência, opinião jurídica, negociação e distribuição final permanecem com as partes responsáveis."]);
}

const candidate = path.join(buildDir, "GC02_Camil_Estrutura_Capital_Conselho_candidate.pptx");
await (await PresentationFile.exportPptx(pres)).save(candidate);
const {finalizePresentation} = await import(pathToFileURL(path.join(skillDir, "container_tools/artifact_tool_utils.mjs")).href);
const pptxPath = path.join(outDir, "GC02_Camil_Estrutura_Capital_Conselho_v1.pptx");
const finalResult = await finalizePresentation({
  workspaceDir,
  candidatePath: candidate,
  finalPath: pptxPath,
  explicitTotalSlideCount: 9,
  requiredNativeTableOwnerSlides: [2, 4, 5, 7, 8, 9],
  requiredNativeChartOwnerSlides: [3, 4, 5, 6],
  materializeLiteralChartWorkbooks: true,
  pythonExecutable: runtimePython,
  integrityValidatorPath: path.join(skillDir, "container_tools/inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(skillDir, "container_tools/inspect_presentation_layout_geometry.py"),
  layoutArgs: ["--expected-slide-size-emu", "12192000,6858000", "--validate-heading-fit", ...[2, 4, 5, 7, 8, 9].flatMap((n) => ["--require-native-table-slide", String(n)])],
  fontPolicy: {basis: "design", families: [font, serif, "Calibri"]},
  verifyArtifactToolImport: true,
  receiptPath: path.join(buildDir, `GC02_Camil_Estrutura_Capital_Conselho_v1.${Date.now()}.validation.json`),
});
await fs.writeFile(path.join(buildDir, "finalizer-result.json"), JSON.stringify(finalResult, null, 2));
console.log(JSON.stringify({xlsxPath, pptxPath, snapshot: snapshot.fingerprint, formulaErrors: formulaErrors.ndjson ?? ""}, null, 2));
