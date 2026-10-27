import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";
import {prepareBoardCapitalDiscussionPacket} from "./board-capital-discussion-packet";
import {boardPacketInput, boardPacketViaPremises} from "./board-capital-discussion-runs.test-support";
import {auroraBoardReadings, type BoardTurn} from "./board-capital-discussion.test-support";
import {boardTemplates} from "./board-capital-discussion-templates";

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
const refusal = /board_capital_(rendered_number_invalid|number_without_origin|unknown_token|date_without_preposition|preposition_on_value|currency_not_supported|field_not_registered|figure_without_origin|figure_diverges|figure_without_statement|figure_reading_invalid|text_reading_not_a_label|text_ref_invalid|template_unknown|slot_invalid|slot_unbound|slot_type_mismatch|template_invalid|title_without_number|answer_without_number|page_without_number|material_fact_not_shown)|Invalid option|Too big|Invalid input|Invalid string|states its value/;

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

/** The eleven families of displayed fields the reviews wrote into. */
const families: [string, (c: CaseData, add: string) => void][] = [
  ["deliberation.title", (c, x) => {c.deliberations[0]!.title += x;}], ["deliberation.recommendation", (c, x) => {c.deliberations[0]!.recommendation += x;}],
  ["deadline.action", (c, x) => {c.deliberations[0]!.deadlines[0]!.action += x;}], ["page.title", (c, x) => {c.pages[1]!.title += x;}],
  ["page.line", (c, x) => {c.pages[1]!.lines[0] += x;}], ["page.recommendation", (c, x) => {c.pages[4]!.recommendation += x;}],
  ["summary.opening", (c, x) => {c.summary.opening += x;}], ["summary.closing", (c, x) => {c.summary.closing += x;}],
  ["appendix.label", (c, x) => {c.appendix[0]!.label += x;}], ["question.question", (c, x) => {c.questions[0]!.question += x;}], ["question.answer", (c, x) => {c.questions[0]!.answer += x;}]];
/** Every attack of the six review rounds, as the prose a contribution would have to write: there is no field for it. */
const attacks = [" Retorno de menos {irr}.", " VPL de menos {npv}.", " O prazo médio é de dezasseis.", " A dívida é a terça parte de {divida-total}.", " Retorno de {irr} por minuto.",
  " Prazo médio de {wal} (leia-se em minutos).", " Dívida {divida-total} bilhões.", " Prazo de {wal} meses.", " A dívida é de {year-2027} BRL.", " A taxa é de １６%.",
  " A dívida equivale a {em:year-2027} ienes.", " Custo de {divida-total} e centavos.", " Retorno de {irr} por semana.", " Dívida -{divida-total}."];

/** An independent reader of the final text. It formats every reading again from its source value, kind, scale,
 * periodicity and presentation with its own rules; then removes from each displayed field every reading's text,
 * every deadline, the counts and ordinals, and requires that what remains passes its own whitelist and lexicon.
 * Every material fact must appear by its own formatted text. */
function oracle(p: Packet) {
  const v = current(p), d = p.result.discussion!;
  const D = Decimal.clone({precision: 60, rounding: Decimal.ROUND_HALF_UP});
  const short = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const long = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const reformat = (x: (typeof d.identity)[number]) => {
    if (x.unit === "label") return x.value;
    if (x.unit === "flag") return x.value === "true" ? "sim" : "não";
    if (x.unit === "calendar") return x.value;
    if (x.unit === "date") {
      const m = Number(x.value.slice(5, 7)) - 1, day = Number(x.value.slice(8, 10));
      return ({day_month: `${day}/${short[m]}`, day_long: `${day} de ${long[m]}`, month_year: `${short[m]}/${x.value.slice(2, 4)}`, month_long: `${long[m]} de ${x.value.slice(0, 4)}`,
        year: x.value.slice(0, 4)} as Record<string, string>)[x.presentation]!;
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
  const counts = ["zero", "uma", "duas", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze"];
  const known = [...d.identity.map((x) => x.display), ...v.deliberations.flatMap((x) => x.deadlines.map((t) => t.display)),
    `Pedimos ${counts[v.deliberations.length]} decisões; ${counts[v.deliberations.filter((x) => x.deadlines.length).length]} têm`, "[pendente]"].sort((a, b) => b.length - a.length);
  const joined = texts.join(" | ");
  // Its own whitelist and lexicon, written apart from the method's.
  const allowed = /^[a-zA-ZÀ-ÿ ,.;:?!()"'“”‘’-]*$/u;
  const lexicon = /(?<![a-zA-ZÀ-ÿ])(menos|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|dezasseis|dezesseis|quinze|vinte|trinta|cem|mil|milh\S*|bilh\S*|centavos?|milhares?|meio|metade|ter[cç]a|ter[cç]o|dobro|reais|real|d[oó]lar\S*|euros?|ienes?|brl|usd|cad|eur|janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|anos?|m[eê]s|meses|dias?|semanas?|semestres?|trimestres?|minutos?|horas?|anual|mensal|semestral|trimestral|cento|percentua\S*|pontos?|x)(?![a-zA-ZÀ-ÿ])/iu;
  for (const t of texts) {
    let rest = t;
    for (const k of known) rest = rest.split(k).join(" ");
    rest = rest.replace(/^\d{1,2}\. /, " ").replace(/\(\d{1,2}\) /g, " ").normalize("NFKC");
    if (!allowed.test(rest)) bad.push(`character@${t.slice(0, 60)}`);
    const word = lexicon.exec(rest);
    if (word) bad.push(`${word[0]}@${t.slice(0, 60)}`);
  }
  const missing = d.materialFacts.figures.filter((id) => {const x = d.identity.find((i) => i.figureId === id); return x !== undefined && !joined.includes(reformat(x));});
  return {bad, missing};
}

describe("board discussion properties (fixed seed)", {timeout: 900000}, () => {
  it("no text field accepts prose: a number, a sign, a fraction or a unit written by a contribution is refused in every field", () => {
    let probe: CaseData | null = null;
    boardPacketInput(2, (c) => {probe = structuredClone(c);});
    const names = textFields(probe!).map(([name]) => name);
    const r = random(4720);
    for (const name of names) {
      const add = pick(r, attacks);
      expect(() => packet(2, (c) => {const f = textFields(c).find(([n]) => n === name)!; f[1](`${f[2]}${add}`);}), name).toThrow(refusal);
    }
    expect(names.length).toBeGreaterThan(80);
  });
  it("regression r1 to r6: every attack in every displayed field family is refused through the full path", () => {
    let refused = 0;
    for (const [family, set] of families) for (const add of attacks) {
      expect(() => full(2, (c) => set(c, add)), `${family} ${add}`).toThrow(refusal);
      refused++;
    }
    expect(refused).toBe(11 * attacks.length);
  });
  it("refuses an unknown template, a missing, extra or repeated slot and a reading of the wrong kind in a slot", () => {
    for (const [name, edit] of [
      ["unknown-template", (c: CaseData) => {c.pages[1]!.title = "situation.debt_total_with_minus|total=divida-total|ano=year-2027";}],
      ["missing-slot", (c: CaseData) => {c.pages[1]!.title = "situation.debt_total|total=divida-total";}],
      ["extra-slot", (c: CaseData) => {c.pages[1]!.title = "situation.debt_total|total=divida-total|ano=year-2027|sinal=irr";}],
      ["repeated-slot", (c: CaseData) => {c.pages[1]!.title = "situation.debt_total|total=divida-total|total=basket|ano=year-2027";}],
      ["years-in-a-months-slot", (c: CaseData) => {c.pages[10]!.lines[1] = "what_changes.wheat|choque=wheat-shock|defasagem=wal|ano=year-2027|ebitda=ebitda-wheat";}],
      ["rate-in-a-money-slot", (c: CaseData) => {c.pages[1]!.title = "situation.debt_total|total=irr|ano=year-2027";}],
      ["value-in-a-date-slot", (c: CaseData) => {c.pages[1]!.title = "situation.debt_total|total=divida-total|ano=divida-total";}],
      ["reading-in-a-deadline-slot", (c: CaseData) => {c.pages[11]!.lines[0] = "next_steps.notice|prazo=tight-week";}],
      ["deadline-in-a-value-slot", (c: CaseData) => {c.pages[1]!.title = "situation.debt_total|total=deadline:linha.aviso|ano=year-2027";}],
      ["prose-in-a-binding", (c: CaseData) => {c.pages[1]!.title = "situation.debt_total|total=menos divida-total|ano=year-2027";}],
    ] as const) expect(() => full(2, edit), name).toThrow(refusal);
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
        return {id: `pedido-${i}`, target, targetId, requestedBy: "requester.chair"};
      });
      const p = packet(3, (c) => {c.omissions = omissions;});
      const s = shown(p);
      expect(p.result.discussion!.materialFacts.figures.filter((id) => !s.has(id)), JSON.stringify(omissions)).toEqual([]);
      expect(p.readings!.material!.materialFactsShown).toBe(true);
      expect(oracle(p)).toEqual({bad: [], missing: []});
    }
  });
  it("regression r1 and r2: transformations never take a material fact out of the current version", () => {
    const date = packet(2, (c) => {c.omissions = [{id: "sem-mes", target: "figure", targetId: "peak-date", requestedBy: "requester.cfo"}];});
    expect(date.readings!.omissions[0]).toMatchObject({outcome: "refused", keptFigureIds: ["payback", "peak-need"]});
    const recommendation = packet(3, (c) => {
      const line = c.pages.find((x) => x.id === "linha")!;
      line.options = line.options.slice(0, 2);
    });
    expect(recommendation.readings!.omissions[0]).toMatchObject({outcome: "refused", keptFigureIds: ["npv-defer", "irr-defer"]});
    expect(() => packet(2, (c) => {c.pages.find((x) => x.id === "linha")!.lines[1] = "topic.project_value|retorno=irr|custo=wacc|vpl=npv";})).toThrow("board_capital_material_fact_not_shown:payback");
    for (const order of [["peak-date", "dez27-date"], ["dez27-date", "peak-date"]]) {
      const p = packet(2, (c) => {
        c.deliberations[0]!.subject = "topic.project_payback|payback=payback|pico=peak-need|data=peak-date";
        c.omissions = order.map((id, i) => ({id: `pedido-${i}`, target: "figure" as const, targetId: id, requestedBy: "requester.chair"}));
      });
      expect(p.readings!.omissions.map((o) => o.outcome)).toEqual(["refused", "refused"]);
      expect(oracle(p)).toEqual({bad: [], missing: []});
    }
  });
  it("regression r3 and r4: a contribution cannot choose the unit, the scale, the periodicity or a date format of a field", () => {
    const tries: [string, string[]][] = [
      ["principal-as-label", ["tabela-divida", "result.table.reconciliation.principal", "-"]],
      ["npv-as-label", ["linha-embalagem", "comparison.metrics[caseId=base].netPresentValue", "-"]],
      ["wal-as-date", ["tabela-divida", "result.table.profile.weightedAverageLifeYears", "day_month", "2026-12-31"]],
      ["debt-scaled-by-a-thousand", ["tabela-divida", "result.table.reconciliation.principal", "0", "130000"]],
      ["unregistered-field", ["linha-embalagem", "comparison.metrics[caseId=base].irrMinusDiscountRate", "2", "0.8"]],
      ["case-label-no-longer-a-label", ["linha-embalagem", "cases[id=defer-12].label", "-"]],
      ["year-from-a-value-field", ["tabela-divida", "result.table.reconciliation.principal", "year", "130"]],
      ["too-many-decimals", ["tabela-divida", "result.table.reconciliation.principal", "3", "130"]]];
    for (const [id, reading] of tries)
      expect(() => full(2, (c) => {(c.extraReadings as Record<string, unknown>)[id] = reading; c.pages[1]!.title = `situation.debt_total|total=${id}|ano=year-2027`;}), id).toThrow(refusal);
  });
  it("property: generated contributions (template ids and bindings at random) are refused or read clean by the independent oracle (fixed seed)", () => {
    const r = random(4724);
    const ids = Object.keys(boardTemplates), readings = Object.keys(auroraBoardReadings);
    const deadlines = ["deadline:linha.aviso", "deadline:safra.adesao", "deadline:vencimentos.sondagem", "deadline:vencimentos.rota"];
    let refused = 0, accepted = 0;
    for (let run = 0; run < 60; run++) {
      const id = pick(r, ids), template = boardTemplates[id]!;
      const bindings = Object.keys(template.slots).map((slot) => `${slot}=${r() < 0.2 ? pick(r, deadlines) : pick(r, readings)}`);
      if (r() < 0.15) bindings.push(`extra=${pick(r, readings)}`);
      const ref = [r() < 0.1 ? `${id}_x` : id, ...bindings].join("|");
      const family = pick(r, families);
      try {
        const p = full(2, (c) => {family[1](c, ""); const f = textFields(c); pick(r, f)[1](ref);});
        accepted++;
        expect(oracle(p), ref).toEqual({bad: [], missing: []});
      } catch (error) {
        expect(String(error), ref).toMatch(refusal);
        refused++;
      }
    }
    expect(refused).toBeGreaterThan(0); expect(accepted).toBeGreaterThan(0);
  });
  it("regression r5: a discussion in another currency is refused, never shown as reais", () => {
    expect(() => prepareBoardCapitalDiscussionPacket(boardPacketViaPremises(2, () => undefined, undefined, (f) => {(f as {currency: string}).currency = "USD";}))).toThrow("board_capital_currency_not_supported:USD");
  });
  it("the independent oracle reads the calibration clean at every turn, through the full path as well", () => {
    for (const turn of [2, 3] as const) expect(oracle(packet(turn, () => undefined))).toEqual({bad: [], missing: []});
    expect(oracle(full(2, () => undefined))).toEqual({bad: [], missing: []});
  });
});
