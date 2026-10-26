import type {AdoptedQuarterUpdateInput, QuarterUpdateAnalyses} from "./adopted-quarter-update";
import {analysisTestBasis, analysisTestId as id} from "./adopted-analysis.test-support";
import {auroraWeeklyCashBasis} from "./weekly-cash.test-support";
import {auroraCovenantBasis, auroraCovenantFacts} from "./covenant-headroom.test-support";
import {auroraWeeklyCash} from "./weekly-cash-streams.test-support";

/** Aurora Alimentos, close of 3T26 read on 15/out/2026 (ficha C54, synthetic). The prior versions are the
 * adopted C18 weekly cash and C12 covenant bases; the close is its own basis. BRL millions. Oracle: modelo_c54.py. */
const iso = (d: Date) => d.toISOString().slice(0, 10);
const at = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const plus = (d: Date, days: number) => new Date(d.getTime() + days * 86400000);
const money = (v: number) => v.toFixed(8).replace(/\.?0+$/, "");
function receipts(days: number) {
  const billing: Record<number, number> = {7: 36.5, 8: 37, 9: 37.5, 10: 38, 11: 41, 12: 42};
  const events: [string, string][] = [];
  for (const [mm, v] of Object.entries(billing)) {
    const m = Number(mm), length = ((m < 12 ? at(2026, m + 1, 1) : at(2027, 1, 1)).getTime() - at(2026, m, 1).getTime()) / 86400000;
    for (let d = 0; d < length; d++) {
      const day = plus(at(2026, m, 1), d + days);
      if (day >= at(2026, 9, 14) && day <= at(2027, 1, 3)) events.push([iso(day), money(v / length)]);
    }
  }
  return events;
}
/** The prior series outside the persistence window (after the close, until the cause ends) and the updated one inside it. */
function persistingOnly(prior: [string, string][], updated: [string, string][], until: string) {
  const inside = (d: string) => d > "2026-09-30" && d <= until;
  const events = [...prior.filter(([d]) => !inside(d)), ...updated.filter(([d]) => inside(d))].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return {dates: events.map(([d]) => d), amounts: events.map(([, v]) => v)};
}
const inputs = auroraWeeklyCash.streams.find((s) => s.id === "insumos")!, priorInputs = inputs.dates.map((d, n) => [d, inputs.amounts[n]!] as [string, string]);
/** Receivable days at 54 and wheat 3% dearer from the close to the end of the persistence date; the prior series outside. */
export const auroraReceipts = (until = "2026-12-31") => persistingOnly(receipts(50), receipts(54), until);
export const auroraDearerInputs = (until = "2026-12-31") => persistingOnly(priorInputs, priorInputs.map(([d]) => [d, "5.858"]), until);
type Origin = "document" | "informed" | "house" | "estimate";
/** The facts of the close, each with where it came from. */
export const auroraClose = {
  quarterStart: "2026-07-01", quarterEnd: "2026-09-30",
  lines: [
    {id: "receita", label: "Receita", unit: "currency" as const, projected: "110", actual: "111.2"},
    {id: "ebitda", label: "EBITDA", unit: "currency" as const, projected: "13.5", actual: "13.1"},
    {id: "caixa", label: "Caixa em 30/set", unit: "currency" as const, projected: "38.9", actual: "37.2"},
    {id: "prazo", label: "Prazo médio de recebimento (dias)", unit: "days" as const, projected: "50", actual: "54"},
    {id: "trigo", label: "Variação do custo do trigo", unit: "ratio" as const, projected: "0", actual: "0.03"},
  ],
  carry: {cashLineId: "caixa", ebitdaLineId: "ebitda"},
  bridges: [
    {lineId: "ebitda", causes: [
      {id: "volume", label: "Volume 1% acima", amount: "0.5", classification: "calendar" as const, until: null, equalsDeviationOf: null, driverLineId: null, nature: null as "flow" | "balance" | null, basis: "interpretation" as const, question: null, origin: "informed" as Origin},
      {id: "trigo", label: "Trigo 3% mais caro desde agosto, sem repasse ainda", amount: "-0.6", classification: "structural" as const, until: "2026-12-31", equalsDeviationOf: null, driverLineId: "trigo", nature: "flow" as "flow" | "balance" | null, basis: "interpretation" as const, question: null, origin: "informed" as Origin},
      {id: "frete-energia", label: "Frete e energia", amount: "-0.3", classification: "calendar" as const, until: null, equalsDeviationOf: null, driverLineId: null, nature: null as "flow" | "balance" | null, basis: "interpretation" as const, question: null, origin: "informed" as Origin},
    ]},
    {lineId: "caixa", causes: [
      {id: "ebitda-abaixo", label: "EBITDA abaixo", amount: "-0.4", classification: "calendar" as const, until: null, equalsDeviationOf: "ebitda", driverLineId: null, nature: null as "flow" | "balance" | null, basis: "document" as const, question: null, origin: "document" as Origin},
      {id: "prazo-redes", label: "Redes pagando em 54 dias (prazo médio de 50)", amount: "-2.1", classification: "structural" as const, until: "2026-12-31", equalsDeviationOf: null, driverLineId: "prazo", nature: "balance" as "flow" | "balance" | null, basis: "interpretation" as const,
        question: "Os 54 dias das redes são prazo negociado ou atraso?", origin: "informed" as Origin},
      {id: "estoque-trigo", label: "Estoque de trigo antecipado em setembro", amount: "-1.6", classification: "calendar" as const, until: null, equalsDeviationOf: null, driverLineId: null, nature: null as "flow" | "balance" | null, basis: "document" as const, question: null, origin: "document" as Origin},
      {id: "impostos-outros", label: "Impostos e outros", amount: "2.4", classification: "calendar" as const, until: null, equalsDeviationOf: null, driverLineId: null, nature: null as "flow" | "balance" | null, basis: "interpretation" as const, question: null, origin: "document" as Origin},
    ]},
  ],
  // R$ 1,000 in millions.
  materialityFloor: "0.001",
  streamUpdates: [
    {streamId: "recebimentos", causeIds: ["prazo-redes"], transform: {kind: "delay" as const, days: 4} as {kind: "scale"; factor: string} | {kind: "delay"; days: number}},
    {streamId: "insumos", causeIds: ["trigo"], transform: {kind: "scale" as const, factor: "1.01"} as {kind: "scale"; factor: string} | {kind: "delay"; days: number}},
  ],
  addedStreams: [{id: "programas-redes", label: "Programas de antecipação das redes A e B", dates: ["2026-10-15"], amounts: ["23"]}],
  covenant: {measurementIds: ["dez26-base", "dez26-gerencial"]},
  facilities: [
    {id: "programas-redes", label: "Programas das redes A e B", limit: "23", source: "Deliberação do conselho de 30/set"},
    {id: "conta-garantida", label: "Conta garantida", limit: "10", source: "Contrato da conta garantida"},
  ],
  steps: [
    {facilityId: "programas-redes", mode: "fixed" as const, streamId: "programas-redes", replacesStreamIds: ["linha-17"]},
    {facilityId: "conta-garantida", mode: "residual" as const, date: "2026-12-14"},
  ],
  dependents: [
    {id: "caixa-semanal", label: "Caixa semanal até dezembro", kind: "analysis" as const, reads: ["caixa", "prazo", "trigo"], horizonStart: "2026-09-14", horizonEnd: "2027-01-03", recomputedBy: "weekly_cash", quantities: ["cash_balance_by_week"], definition: null as string | null, scenario: "linha-17" as string | null, owner: null as string | null},
    {id: "covenant-dez26", label: "Covenant de dezembro de 2026, definição da escritura", kind: "analysis" as const, reads: ["ebitda", "caixa"], horizonStart: "2026-01-01", horizonEnd: "2026-12-31", recomputedBy: "covenant:dez26-base", quantities: ["covenant_ratio", "covenant_headroom"], definition: "Definição da escritura (CVM 156 menos arrendamentos)" as string | null, scenario: "base" as string | null, owner: null as string | null},
    {id: "covenant-dez26-gerencial", label: "Covenant de dezembro de 2026, definição gerencial", kind: "analysis" as const, reads: ["ebitda", "caixa"], horizonStart: "2026-01-01", horizonEnd: "2026-12-31", recomputedBy: "covenant:dez26-gerencial", quantities: ["covenant_ratio", "covenant_headroom"], definition: "Definição gerencial adotada pelo conselho" as string | null, scenario: "gerencial_dez" as string | null, owner: null as string | null},
    {id: "projecao-2026", label: "Projeção de 2026 (EBITDA do ano)", kind: "plan" as const, reads: ["ebitda"], horizonStart: "2026-01-01", horizonEnd: "2026-12-31", recomputedBy: "projection:2026", quantities: ["annual_ebitda"], definition: null as string | null, scenario: "base" as string | null, owner: null as string | null},
    {id: "tabela-divida", label: "Tabela de dívida (só os pagamentos de juros e do Finame de 15/set)", kind: "analysis" as const, reads: [], horizonStart: "2026-09-30", horizonEnd: "2026-09-30", recomputedBy: "none", quantities: ["debt_by_instrument"], definition: null as string | null, scenario: null as string | null, owner: "build-company-debt-table" as string | null},
    {id: "plano-2027", label: "Plano para 2027, com o repasse do trigo concluído no primeiro trimestre", kind: "plan" as const, reads: ["receita", "ebitda", "caixa"], horizonStart: "2027-01-01", horizonEnd: "2027-12-31", recomputedBy: "none", quantities: ["annual_ebitda", "cash_balance_by_month"], definition: null as string | null, scenario: "base" as string | null, owner: "build-operating-projection" as string | null},
    {id: "linha-embalagem", label: "Análise da linha de embalagem", kind: "analysis" as const, reads: ["ebitda", "caixa"], horizonStart: "2027-01-01", horizonEnd: "2031-12-31", recomputedBy: "none", quantities: ["project_return"], definition: null as string | null, scenario: "base" as string | null, owner: "analyze-investment-project" as string | null},
    {id: "material-sondagem", label: "Material da sondagem da debênture (EBITDA de junho)", kind: "material" as const, reads: ["ebitda"], horizonStart: "2025-07-01", horizonEnd: "2026-06-30", recomputedBy: "none", quantities: ["covenant_ratio", "annual_ebitda"], definition: null as string | null, scenario: "base" as string | null, owner: "autoria do material da sondagem" as string | null},
  ],
};

const policyDefinition = "EBITDA gerencial: CVM 156 com os ajustes da administração, sem descontar arrendamentos (ata de 30/set)";
const definitionRead = {base: "Definição da escritura (CVM 156 menos arrendamentos)", managerial: "Definição gerencial adotada pelo conselho"};
/** The prior December test (C12) with the policy's managerial definition written, measured on the indenture and on the board's managerial EBITDA. */
export function auroraPriorCovenantBasis() {
  const b = auroraCovenantBasis({policyDefinition});
  const m = (b.input as unknown as {measurements: {id: string; label: string}[]}).measurements;
  m.find((x) => x.id === "dez26-base")!.label = definitionRead.base;
  const p = "measurement.dez26-gerencial.", sc = "gerencial_dez", num = (path: string, value: string) => b.contribute(p + path, "currency", {type: "number", value}, sc);
  m.push({id: "dez26-gerencial", label: definitionRead.managerial, role: "test", limitIds: ["politica"], scenario: sc, date: b.contribute(p + "date", "date", {type: "date", value: "2026-12-31"}, sc),
    debt: num("debt", "128.66666667"), cash: num("cash", "15.45720186"), reportedEbitda: num("reportedEbitda", "55.5"), adjustments: [], unrealizedEbitda: null} as never);
  return b;
}
export function auroraPriorCovenantFacts() {
  const f = auroraCovenantFacts({policyDefinition});
  f.measurements = f.measurements.map((x) => x.value.id === "dez26-base" ? {...x, value: {...x.value, label: definitionRead.base}} : x);
  f.measurements.push({value: {id: "dez26-gerencial", label: definitionRead.managerial, role: "test", scenario: "gerencial_dez", date: "2026-12-31", debt: "128.66666667", cash: "15.45720186",
    reportedEbitda: "55.5", limitIds: ["politica"], adjustments: [], unrealizedEbitda: null}, origin: "informed", source: "plano trimestral da companhia pela definição gerencial"});
  return f;
}

/** The close as adopted contributions, on its own basis, naming the two prior bases by fingerprint. */
export function auroraQuarterUpdateBasis() {
  const c = auroraClose, weekly = auroraWeeklyCashBasis(), covenant = auroraPriorCovenantBasis();
  const prior = {weeklyCash: weekly.seal(), covenant: covenant.seal()};
  const f = analysisTestBasis(`quarter_update.${id(90)}.`, c.quarterStart, c.quarterEnd);
  const num = (p: string, unit: string, value: string) => f.contribute(p, unit, {type: "number", value});
  const text = (p: string, value: string, unit = "text") => f.contribute(p, unit, {type: "text", value});
  const list = (p: string, unit: string, value: string[]) => f.contribute(p, unit, {type: "list", value});
  const date = (p: string, value: string) => f.contribute(p, "date", {type: "date", value});
  const input = {...f.context, analysisId: id(90), scenario: "base",
    priorWeeklyFingerprint: text("prior.weeklyCash.fingerprint", prior.weeklyCash.envelope.fingerprint, "identity"),
    priorCovenantFingerprint: text("prior.covenant.fingerprint", prior.covenant.envelope.fingerprint, "identity"),
    lines: c.lines.map((l) => ({id: l.id, unit: l.unit, label: text(`line.${l.id}.label`, l.label), projected: num(`line.${l.id}.projected`, l.unit, l.projected), actual: num(`line.${l.id}.actual`, l.unit, l.actual)})),
    carry: c.carry,
    bridges: c.bridges.map((b) => ({lineId: b.lineId, causes: b.causes.map((x) => {const p = `cause.${x.id}.`; return {id: x.id, equalsDeviationOf: x.equalsDeviationOf, driverLineId: x.driverLineId,
      label: text(p + "label", x.label), amount: num(p + "amount", "currency", x.amount), classification: text(p + "classification", x.classification, "convention"),
      until: x.until === null ? null : date(p + "until", x.until), nature: x.nature === null ? null : text(p + "nature", x.nature, "convention"), basis: text(p + "basis", x.basis, "convention"), question: x.question === null ? null : text(p + "question", x.question)};})})),
    streamUpdates: c.streamUpdates.map((u) => ({streamId: u.streamId, causeIds: u.causeIds,
      transformKind: text(`streamUpdate.${u.streamId}.transformKind`, u.transform.kind, "convention"),
      transformValue: u.transform.kind === "scale" ? num(`streamUpdate.${u.streamId}.transformValue`, "ratio", u.transform.factor) : num(`streamUpdate.${u.streamId}.transformValue`, "days", String(u.transform.days))})),
    materialityFloor: num("materialityFloor", "currency", c.materialityFloor),
    addedStreams: c.addedStreams.map((s) => ({id: s.id, label: text(`added.${s.id}.label`, s.label), dates: list(`added.${s.id}.dates`, "date", s.dates), amounts: list(`added.${s.id}.amounts`, "currency", s.amounts)})),
    covenant: {measurementIds: c.covenant.measurementIds},
    facilities: c.facilities.map((x) => ({id: x.id, label: text(`facility.${x.id}.label`, x.label), limit: num(`facility.${x.id}.limit`, "currency", x.limit), source: text(`facility.${x.id}.source`, x.source)})),
    steps: c.steps.map((s) => s.mode === "fixed" ? s : {facilityId: s.facilityId, mode: s.mode, date: date(`step.${s.facilityId}.date`, s.date)}),
    dependents: c.dependents.map((d) => {const p = `dependent.${d.id}.`; return {id: d.id, label: text(p + "label", d.label), kind: text(p + "kind", d.kind, "convention"),
      reads: list(p + "reads", "identity", d.reads), horizonStart: date(p + "horizonStart", d.horizonStart), horizonEnd: date(p + "horizonEnd", d.horizonEnd),
      recomputedBy: text(p + "recomputedBy", d.recomputedBy, "convention"), owner: d.owner === null ? null : text(p + "owner", d.owner),
      quantities: list(p + "quantities", "identity", d.quantities), definition: d.definition === null ? null : text(p + "definition", d.definition),
      scenario: d.scenario === null ? null : text(p + "scenario", d.scenario, "identity")};}),
  } as unknown as AdoptedQuarterUpdateInput;
  const seal = (): QuarterUpdateAnalyses => ({prior, update: {...input, envelope: f.seal()}});
  return {...f, input, prior, weekly, covenant, seal};
}

/** The close as facts with their origin, for the premises path. */
export function auroraQuarterUpdateFacts(priorWeeklyFingerprint: string, priorCovenantFingerprint: string): import("./quarter-update-premises").QuarterUpdateFacts {
  // A copy, so a test that edits the facts never edits the calibration.
  const c = structuredClone(auroraClose);
  const fact = <T>(value: T, origin: Origin, source: string) => ({value, origin, source});
  return {updateId: id(9100), entityId: id(1), perimeter: "standalone", currency: "BRL", definitionVersionId: id(3),
    quarterStart: c.quarterStart, quarterEnd: c.quarterEnd,
    priorWeeklyFingerprint: fact(priorWeeklyFingerprint, "house", "versão do caixa semanal adotada antes do fechamento"),
    priorCovenantFingerprint: fact(priorCovenantFingerprint, "house", "versão do teste de covenant adotada antes do fechamento"),
    lines: c.lines.map((l) => fact(l, "document", "balancete de setembro e gerencial do 3T26")),
    carry: fact(c.carry, "house", "caixa e EBITDA do fechamento entram na projeção"),
    bridges: c.bridges.map((b) => ({lineId: b.lineId, causes: b.causes.map(({origin, ...x}) => fact(x, origin,
      origin === "document" ? "balancete de setembro e gerencial do 3T26" : "explicação da controladoria sobre o desvio"))})),
    streamUpdates: c.streamUpdates.map((u) => fact(u, "estimate", "prazo e custo do fechamento aplicados à série anterior")),
    materialityFloor: fact(c.materialityFloor, "house", "R$ 1 mil em milhões, piso de materialidade do efeito semanal"),
    addedStreams: c.addedStreams.map((s) => fact(s, "estimate", "programas na data da linha que substituem")),
    covenant: fact(c.covenant, "estimate", "efeito das causas estruturais até a data do teste"),
    facilities: c.facilities.map((x) => fact(x, "document", x.source)),
    steps: c.steps.map((s) => fact(s, "house", "ação dentro do que o conselho já aprovou")),
    dependents: c.dependents.map((d) => fact(d, "house", "mapa de dependências das análises da companhia"))};
}
