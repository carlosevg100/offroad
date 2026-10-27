import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";
import {prepareBoardCapitalDiscussionPacket} from "./board-capital-discussion-packet";
import {boardPacketInput, boardPacketViaPremises} from "./board-capital-discussion-runs.test-support";
import {auroraBoardReadings, type BoardTurn} from "./board-capital-discussion.test-support";

type CaseData = Parameters<NonNullable<Parameters<typeof boardPacketInput>[1]>>[0];
/** A fixed-seed generator (mulberry32), so every property run is the same run. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296;};
}
const pick = <T>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
const packet = (turn: BoardTurn, edit: (c: CaseData) => void) => prepareBoardCapitalDiscussionPacket(boardPacketInput(turn, edit));
/** The full path: facts, premises, composer, adopted reader and packet. */
const full = (turn: BoardTurn, edit: (c: CaseData) => void) => prepareBoardCapitalDiscussionPacket(boardPacketViaPremises(turn, edit));
type Packet = ReturnType<typeof packet>;
const current = (p: Packet) => p.result.discussion!.versions.at(-1)!;
const shown = (p: Packet) => {
  const v = current(p);
  return new Set([...v.pages.flatMap((x) => x.figureIds), ...v.questions.flatMap((x) => x.figureIds), ...v.deliberations.flatMap((x) => x.figureIds), ...v.summaryFigureIds]);
};
const refusal = /board_capital_(rendered_number_invalid|number_without_origin|unknown_token|field_not_registered|figure_without_origin|figure_diverges|figure_without_statement|figure_reading_invalid|text_reading_not_a_label)|Invalid option|Too big|Invalid input|states its value/;

/** Every generated text field of the case, as a setter, so a number can be written into any of them. */
function textFields(c: CaseData): [string, (v: string) => void, string][] {
  const out: [string, (v: string) => void, string][] = [];
  c.deliberations.forEach((d, i) => {
    out.push([`deliberation.${d.id}.title`, (v) => {c.deliberations[i]!.title = v;}, d.title], [`deliberation.${d.id}.subject`, (v) => {c.deliberations[i]!.subject = v;}, d.subject]);
    if (d.recommendation) out.push([`deliberation.${d.id}.recommendation`, (v) => {c.deliberations[i]!.recommendation = v;}, d.recommendation]);
    d.deadlines.forEach((t, j) => out.push([`deliberation.${d.id}.deadline.${t.id}`, (v) => {c.deliberations[i]!.deadlines[j]!.action = v;}, t.action]));
    out.push([`deliberation.${d.id}.authorityBasis`, (v) => {c.deliberations[i]!.authorityBasis = v;}, "Política de endividamento aprovada na ata de março"]);
  });
  c.pages.forEach((p, i) => {
    out.push([`page.${p.id}.title`, (v) => {c.pages[i]!.title = v;}, p.title]);
    p.lines.forEach((l, j) => out.push([`page.${p.id}.line.${j}`, (v) => {c.pages[i]!.lines[j] = v;}, l]));
    if (p.recommendation) out.push([`page.${p.id}.recommendation`, (v) => {c.pages[i]!.recommendation = v;}, p.recommendation]);
    p.options.forEach((o, j) => out.push([`page.${p.id}.option.${j}`, (v) => {c.pages[i]!.options[j] = v;}, o]));
  });
  out.push(["summary.opening", (v) => {c.summary.opening = v;}, c.summary.opening], ["summary.closing", (v) => {c.summary.closing = v;}, c.summary.closing]);
  c.appendix.forEach((a, i) => out.push([`appendix.${a.id}`, (v) => {c.appendix[i]!.label = v;}, a.label]));
  c.questions.forEach((q, i) => out.push([`question.${q.id}.question`, (v) => {c.questions[i]!.question = v;}, q.question], [`question.${q.id}.answer`, (v) => {c.questions[i]!.answer = v;}, q.answer]));
  c.topics.forEach((t, i) => out.push([`topic.${t.id}`, (v) => {c.topics[i]!.label = v;}, t.label]));
  return out;
}

/** The eleven families of displayed fields the reviews wrote numbers into. */
const families: [string, (c: CaseData, add: string) => void][] = [
  ["deliberation.title", (c, x) => {c.deliberations[0]!.title += x;}], ["deliberation.recommendation", (c, x) => {c.deliberations[0]!.recommendation += x;}],
  ["deadline.action", (c, x) => {c.deliberations[0]!.deadlines[0]!.action += x;}], ["page.title", (c, x) => {c.pages[1]!.title += x;}],
  ["page.line", (c, x) => {c.pages[1]!.lines[0] += x;}], ["page.recommendation", (c, x) => {c.pages[4]!.recommendation += x;}],
  ["summary.opening", (c, x) => {c.summary.opening += x;}], ["summary.closing", (c, x) => {c.summary.closing += x;}],
  ["appendix.label", (c, x) => {c.appendix[0]!.label += x;}], ["question.question", (c, x) => {c.questions[0]!.question += x;}], ["question.answer", (c, x) => {c.questions[0]!.answer += x;}]];
/** Every attack of the four review rounds, in the contribution syntax of this version. */
const attacks = {
  decimal: " Dívida {divida-total},{basket-free}.", digits: " Dívida {divida-total}{basket-free}.", sign: " Dívida -{divida-total}.",
  yearAsMoney: " Dívida R$ {year-2027}.", yearAsAmount: " Dívida em {year-2027} milhões.", wrongUnit: " Dívida {divida-total}x.",
  billions: " Dívida {divida-total} bilhões.", monthsForYears: " Prazo de {wal} meses.", reais: " A dívida vence em {year-2027} reais.", spacedPercent: " Alta em {year-2027} % ao ano.",
  brlCode: " A dívida é de {year-2027} BRL.", usdCode: " A dívida é de {year-2027} USD.", percentInWords: " A taxa é de {year-2027} por cento ao ano.",
  capitalized: " A dívida é de {year-2027} Bilhões de Reais.", monthlyReturn: " Retorno de {irr} ao mês.", monthlySpread: " CDI mais {deb-cost-low} ao mês.",
  isoAfter: " Dívida {divida-total} BRL.", percentWordsAfter: " Retorno de {irr} por cento.", capsScale: " Dívida {divida-total} MILHÕES.", calendarAsValue: " A dívida é de {year-2027}.",
} as const;

/** An independent reader of the final text. It formats every reading again from its source value, kind, scale,
 * periodicity and decimals with its own rules; then removes from each displayed field every reading's text, every
 * deadline and every ordinal the method writes, and requires that nothing numeric, no currency, scale, percent or
 * periodicity word remains. Every material fact must appear by its own formatted text. */
function oracle(p: Packet) {
  const v = current(p), d = p.result.discussion!;
  const D = Decimal.clone({precision: 60, rounding: Decimal.ROUND_HALF_UP});
  const reformat = (x: (typeof d.identity)[number]) => {
    if (x.unit === "label") return x.value;
    if (x.unit === "flag") return x.value === "true" ? "sim" : "não";
    if (x.unit === "calendar") return x.value;
    if (x.unit === "date") {
      const m = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(x.value.slice(5, 7)) - 1]!;
      return x.presentation === "day_month" ? `${Number(x.value.slice(8, 10))}/${m}` : x.presentation === "month_year" ? `${m}/${x.value.slice(2, 4)}` : x.value.slice(0, 4);
    }
    const scaled = x.scale === "reais" ? new D(x.value).div(1000000) : x.scale === "ratio" ? new D(x.value).times(100) : new D(x.value);
    const n = scaled.toFixed(Number(x.presentation)).replace(".", ",");
    const per = x.period === "annual" ? (x.unit === "rate" ? " ao ano" : " por ano") : "";
    return x.unit === "money" ? `R$ ${n} ${scaled.abs().toDecimalPlaces(Number(x.presentation)).lt(2) ? "milhão" : "milhões"}${per}` : x.unit === "rate" ? `${n}%${per}`
      : x.unit === "multiple" ? `${n}x` : x.unit === "years" ? `${n} ${n === "1" ? "ano" : "anos"}` : x.unit === "months" ? `${n} ${n === "1" ? "mês" : "meses"}` : x.unit === "bps" ? `${n} pontos` : n;
  };
  const bad: string[] = d.identity.filter((x) => reformat(x) !== x.display).map((x) => `format:${x.figureId}`);
  const texts = [v.summary, ...v.pages.flatMap((x) => [x.title, ...x.lines, x.recommendation ?? "", ...x.options]), ...v.deliberations.flatMap((x) => [x.title, x.text, ...x.deadlines.map((t) => t.action)]),
    ...v.questions.flatMap((x) => [x.question, x.answer]), ...v.appendix.map((x) => x.label)];
  const known = [...d.identity.map((x) => x.display), ...v.deliberations.flatMap((x) => x.deadlines.map((t) => t.display))].sort((a, b) => b.length - a.length);
  const joined = texts.join(" | ");
  for (const t of texts) {
    let rest = t;
    for (const k of known) rest = rest.split(k).join(" § ");
    rest = rest.replace(/^\d{1,2}\. /, "").replace(/\(\d{1,2}\) /g, "");
    for (const m of rest.matchAll(/\d|R\$|US\$|€|%|\b(?:brl|usd|reais|bilh\S*|milh\S*|mi|por cento|ao ano|ao m[eê]s|por ano|por m[eê]s)\b/giu)) bad.push(`${m[0]}@${t.slice(0, 60)}`);
  }
  const missing = d.materialFacts.figures.filter((id) => {const x = d.identity.find((i) => i.figureId === id); return x !== undefined && !joined.includes(reformat(x));});
  return {bad, missing};
}

describe("board discussion properties (fixed seed)", {timeout: 900000}, () => {
  it("refuses a literal number written into any generated text field", () => {
    const r = random(4720);
    let probe: CaseData | null = null;
    boardPacketInput(2, (c) => {probe = structuredClone(c);});
    const names = textFields(probe!).map(([name]) => name);
    for (const name of names) {
      const number = pick(r, ["16,1%", "R$ 130,1 milhões", "2,21x", "1,4 ano", "dia 3", "2027"]);
      expect(() => packet(2, (c) => {const f = textFields(c).find(([n]) => n === name)!; f[1](`${f[2]} com ${number}`);}), name).toThrow(/board_capital_number_without_origin/);
    }
    expect(names.length).toBeGreaterThan(80);
  });
  it("keeps every material fact in the current version under any sequence of omission requests", () => {
    const r = random(4721);
    let probe: CaseData | null = null;
    boardPacketInput(3, (c) => {probe = structuredClone(c);});
    const pages = probe!.pages.map((p) => p.id), figures = [...Object.keys(auroraBoardReadings), "stages-npv"];
    const deadlines = probe!.deliberations.flatMap((d) => d.deadlines.map((t) => `${d.id}.${t.id}`));
    for (let run = 0; run < 24; run++) {
      const omissions = Array.from({length: 1 + Math.floor(r() * 4)}, (_, i) => {
        const target = pick(r, ["recommendation", "page", "figure", "figure", "deadline"] as const);
        const targetId = target === "figure" ? pick(r, figures) : target === "deadline" ? pick(r, deadlines) : pick(r, pages);
        return {id: `pedido-${i}`, target, targetId, requestedBy: "Presidente do conselho"};
      });
      const p = packet(3, (c) => {c.omissions = omissions;});
      const s = shown(p);
      expect(p.result.discussion!.materialFacts.figures.filter((id) => !s.has(id)), JSON.stringify(omissions)).toEqual([]);
      expect(p.readings!.material!.materialFactsShown).toBe(true);
      expect(oracle(p)).toEqual({bad: [], missing: []});
    }
  });
  it("regression r1: removing a date or a label that shares a line with material facts is refused", () => {
    const date = packet(2, (c) => {c.omissions = [{id: "sem-mes", target: "figure", targetId: "peak-date", requestedBy: "CFO"}];});
    expect(date.readings!.omissions[0]).toMatchObject({outcome: "refused", keptFigureIds: ["payback", "peak-need"]});
    const label = packet(2, (c) => {c.omissions = [{id: "sem-rotulo", target: "figure", targetId: "label-economy", requestedBy: "CFO"}];});
    expect(label.readings!.omissions[0]).toMatchObject({outcome: "refused", keptFigureIds: ["npv-economy", "npv-capex", "npv-slow"]});
  });
  it("regression r1: withdrawing a recommendation that alone carries material facts is refused", () => {
    const p = packet(3, (c) => {
      const line = c.pages.find((x) => x.id === "linha")!;
      line.recommendation = "Recomendamos pedir cotações firmes; com economia menor o VPL vai a {npv-economy} e com capex maior a {npv-capex}; partida mais lenta, {npv-slow}; adiar doze meses leva o VPL a {npv-defer} e o retorno a {irr-defer}.";
      line.lines.splice(2, 1);
    });
    expect(p.readings!.omissions[0]).toMatchObject({outcome: "refused", keptFigureIds: ["npv-economy", "npv-capex", "npv-slow"]});
    expect(current(p).pages.find((x) => x.id === "linha")!.recommendation).not.toBeNull();
  });
  it("regression r1 and r2: false numbers in titles and labels, paraphrase that drops a fact, hidden subjects", () => {
    expect(() => packet(2, (c) => {c.deliberations[0]!.title = "Linha de embalagem com retorno de 16,1%";})).toThrow("board_capital_number_without_origin");
    expect(() => packet(2, (c) => {c.appendix[0]!.label = "Tabela de dívida de R$ 130,1 milhões";})).toThrow("board_capital_number_without_origin");
    expect(current(packet(2, (c) => {c.deliberations[0]!.title = "Linha de embalagem com retorno de {irr}";})).deliberations[0]!.title).toBe("Linha de embalagem com retorno de 16% ao ano");
    expect(() => packet(2, (c) => {c.pages.find((x) => x.id === "linha")!.lines[1] = "O fluxo acumulado do projeto chega a {peak-need} em {peak-date}.";})).toThrow("board_capital_material_fact_not_shown:payback");
    for (const order of [["peak-date", "label-economy"], ["label-economy", "peak-date"]]) {
      const p = packet(2, (c) => {
        c.deliberations[0]!.subject = "decidir com payback de {payback} e fluxo de {peak-need}; VPLs de {npv-economy}, {npv-capex}, {npv-slow}";
        c.omissions = order.map((id, i) => ({id: `pedido-${i}`, target: "figure" as const, targetId: id, requestedBy: "Presidente, para deixar o texto mais leve"}));
      });
      expect(p.readings!.omissions.map((o) => o.outcome)).toEqual(["refused", "refused"]);
      expect(oracle(p)).toEqual({bad: [], missing: []});
    }
  });
  it("regression r2 to r4: every attack in every displayed field family is refused through the full path", () => {
    let refused = 0;
    for (const [family, set] of families) for (const [kind, add] of Object.entries(attacks)) {
      expect(() => full(2, (c) => set(c, add)), `${family} ${kind}`).toThrow(refusal);
      refused++;
    }
    expect(refused).toBe(11 * Object.keys(attacks).length);
  });
  it("regression r3 and r4: a contribution cannot choose the unit, the scale, the periodicity or a date format of a field", () => {
    const tries: [string, string[]][] = [
      ["principal-as-label", ["tabela-divida", "result.table.reconciliation.principal", "-"]],
      ["spread-as-label", ["recebiveis", "readings.options[id=risco-sacado-a].spreadOverDi", "-"]],
      ["npv-as-label", ["linha-embalagem", "comparison.metrics[caseId=base].netPresentValue", "-"]],
      ["wal-as-date", ["tabela-divida", "result.table.profile.weightedAverageLifeYears", "day_month", "2026-12-31"]],
      ["debt-scaled-by-a-thousand", ["tabela-divida", "result.table.reconciliation.principal", "0", "130000"]],
      ["unregistered-field", ["linha-embalagem", "comparison.metrics[caseId=base].irrMinusDiscountRate", "2", "0.8"]],
      ["year-from-a-value-field", ["tabela-divida", "result.table.reconciliation.principal", "year", "130"]],
      ["too-many-decimals", ["tabela-divida", "result.table.reconciliation.principal", "3", "130"]]];
    for (const [id, reading] of tries)
      expect(() => full(2, (c) => {(c.extraReadings as Record<string, unknown>)[id] = reading; c.pages[1]!.lines[0] += ` Valor: {${id}}.`;}), id).toThrow(refusal);
  });
  it("property: generated contributions that try to change unit, scale, periodicity or date marker are refused (fixed seed)", () => {
    const r = random(4723);
    const numeric = Object.entries(auroraBoardReadings).filter(([, x]) => /^[0-2]$/.test(x[2])).map(([id]) => id);
    const words = [" meses", " anos", " ao mês", " ao ano", " por cento", " bilhões", " Milhões", " BRL", " usd", " reais", "%", "x", " p.p.", " a.m."];
    for (let run = 0; run < 40; run++) {
      const id = pick(r, numeric), family = pick(r, families), mode = pick(r, ["suffix", "prefix", "presentation", "scale"] as const);
      const attempt = () => full(2, (c) => {
        if (mode === "suffix") family[1](c, ` Valor {${id}}${pick(r, words)}.`);
        else if (mode === "prefix") family[1](c, ` Valor ${pick(r, ["R$", "US$", "-", "+", "BRL", "em reais"])} {${id}}.`);
        else {
          const base = auroraBoardReadings[id]!;
          const reading = mode === "presentation" ? [base[0], base[1], pick(r, ["day_month", "month_year", "year", "-", "3"]), base[3]!]
            : [base[0], base[1], base[2], new Decimal(base[3]!).times(pick(r, ["1000", "100", "0.001", "12"])).toFixed()];
          (c.extraReadings as Record<string, unknown>)[`${id}-variante`] = reading; family[1](c, ` Valor {${id}-variante}.`);
        }
      });
      expect(attempt, `${mode} ${id}`).toThrow(refusal);
    }
  });
  it("the independent oracle reads the calibration clean at every turn, through the full path as well", () => {
    for (const turn of [2, 3] as const) expect(oracle(packet(turn, () => undefined))).toEqual({bad: [], missing: []});
    expect(oracle(full(2, () => undefined))).toEqual({bad: [], missing: []});
  });
});
