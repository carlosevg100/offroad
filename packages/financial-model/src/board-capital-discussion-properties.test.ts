import {describe, expect, it} from "vitest";
import {prepareBoardCapitalDiscussionPacket} from "./board-capital-discussion-packet";
import {boardPacketInput} from "./board-capital-discussion-runs.test-support";
import {auroraBoardReadings, type BoardTurn} from "./board-capital-discussion.test-support";

type CaseData = Parameters<NonNullable<Parameters<typeof boardPacketInput>[1]>>[0];
/** A fixed-seed generator (mulberry32), so every property run is the same run. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296;};
}
const pick = <T>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
const packet = (turn: BoardTurn, edit: (c: CaseData) => void) => prepareBoardCapitalDiscussionPacket(boardPacketInput(turn, edit));
const current = (p: ReturnType<typeof packet>) => p.result.discussion!.versions.at(-1)!;
const shown = (p: ReturnType<typeof packet>) => {
  const v = current(p);
  return new Set([...v.pages.flatMap((x) => x.figureIds), ...v.questions.flatMap((x) => x.figureIds), ...v.deliberations.flatMap((x) => x.figureIds), ...v.summaryFigureIds]);
};
const economic = Object.entries(auroraBoardReadings).filter(([, r]) => !["text", "boolean", "date_day_month", "date_month_year"].includes(r[2])).map(([id]) => id);

/** Every generated text field of the case, as a setter, so a divergent number can be written into any of them. */
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

describe("board discussion properties (fixed seed)", {timeout: 600000}, () => {
  it("refuses a divergent number written into any generated text field", () => {
    const r = random(4720);
    let probe: CaseData | null = null;
    boardPacketInput(2, (c) => {probe = structuredClone(c);});
    const names = textFields(probe!).map(([name]) => name);
    for (const name of names) {
      const number = pick(r, ["16,1%", "R$ 130,1 milhões", "2,21x", "1,4 ano", "dia 3"]);
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
      expect(economic.filter((id) => !s.has(id)), JSON.stringify(omissions)).toEqual([]);
      expect(p.readings!.material!.materialFactsShown).toBe(true);
      expect(current(p).deliberations.flatMap((d) => d.deadlines.map((t) => `${d.id}.${t.id}`))).toEqual(["linha.aviso", "safra.adesao", "vencimentos.sondagem", "vencimentos.rota"]);
    }
  });
  it("regression: removing a date that shares a line with material facts is refused (review r1)", () => {
    const p = packet(2, (c) => {c.omissions = [{id: "sem-mes", target: "figure", targetId: "peak-date", requestedBy: "CFO, para deixar a página mais leve"}];});
    expect(p.readings!.omissions[0]).toMatchObject({outcome: "refused", keptFigureIds: ["payback", "peak-need"]});
    expect(shown(p).has("payback") && shown(p).has("peak-need")).toBe(true);
  });
  it("regression: removing a non-material label that carries the sensitivities is refused (review r1)", () => {
    const p = packet(2, (c) => {c.omissions = [{id: "sem-rotulo", target: "figure", targetId: "label-economy", requestedBy: "CFO"}];});
    expect(p.readings!.omissions[0]).toMatchObject({outcome: "refused", keptFigureIds: ["npv-economy", "npv-capex", "npv-slow"]});
  });
  it("regression: withdrawing a recommendation that alone carries material facts is refused (review r1)", () => {
    const p = packet(3, (c) => {
      const line = c.pages.find((x) => x.id === "linha")!;
      line.lines[2] = "Motivo estratégico: depender menos de um único fornecedor de embalagem.";
      line.recommendation = "Recomendamos pedir cotações firmes; com economia menor o VPL vai a R$ {npv-economy} milhões e com capex maior a R$ {npv-capex} milhões; partida mais lenta, R$ {npv-slow} milhão; adiar doze meses leva o VPL a R$ {npv-defer} milhão e o retorno a {irr-defer}%.";
      line.lines.splice(3, 1);
    });
    expect(p.readings!.omissions[0]).toMatchObject({outcome: "refused", keptFigureIds: ["npv-economy", "npv-capex", "npv-slow"]});
    expect(current(p).pages.find((x) => x.id === "linha")!.recommendation).not.toBeNull();
  });
  it("regression: a false number in a deliberation title or an appendix label is refused (review r1)", () => {
    expect(() => packet(2, (c) => {c.deliberations[0]!.title = "Linha de embalagem com retorno de 16,1%";})).toThrow("board_capital_number_without_origin");
    expect(() => packet(2, (c) => {c.appendix[0]!.label = "Tabela de dívida de R$ 130,1 milhões";})).toThrow("board_capital_number_without_origin");
    const p = packet(2, (c) => {c.deliberations[0]!.title = "Linha de embalagem com retorno de {irr}%";});
    expect(current(p).deliberations[0]!.title).toBe("Linha de embalagem com retorno de 16%");
  });
  it("regression: a paraphrase of the basis that drops a material fact is refused", () => {
    expect(() => packet(2, (c) => {c.pages.find((x) => x.id === "linha")!.lines[1] = "O fluxo acumulado do projeto chega a R$ {peak-need} milhões em {peak-date}.";}))
      .toThrow("board_capital_material_fact_not_shown:payback");
  });
  it("requires an economic reading in each title and answer and the unit sign on every spread", () => {
    expect(() => packet(2, (c) => {c.pages.find((x) => x.id === "safra")!.title = "A safra pode ser financiada pelos programas dos clientes, sem dívida bancária nova";})).toThrow("board_capital_title_without_number:safra");
    expect(() => packet(2, (c) => {c.questions[6]!.answer = "Reduz a dependência; cotações firmes decidem em {tight-week}.";})).toThrow("board_capital_answer_without_number:estrategica");
    expect(() => packet(2, (c) => {c.pages.find((x) => x.id === "safra")!.lines[0] = "Programas a CDI mais {spread-b} a {spread-a}% ao ano, em condições indicativas.";})).toThrow("board_capital_unit_missing:spread-b");
  });

  /** The eleven families of displayed fields the r2 review wrote numbers into. */
  const families: [string, (c: CaseData, add: string) => void][] = [
    ["deliberation.title", (c, x) => {c.deliberations[0]!.title += x;}], ["deliberation.recommendation", (c, x) => {c.deliberations[0]!.recommendation += x;}],
    ["deadline.action", (c, x) => {c.deliberations[0]!.deadlines[0]!.action += x;}], ["page.title", (c, x) => {c.pages[1]!.title += x;}],
    ["page.line", (c, x) => {c.pages[1]!.lines[0] += x;}], ["page.recommendation", (c, x) => {c.pages[4]!.recommendation += x;}],
    ["summary.opening", (c, x) => {c.summary.opening += x;}], ["summary.closing", (c, x) => {c.summary.closing += x;}],
    ["appendix.label", (c, x) => {c.appendix[0]!.label += x;}], ["question.question", (c, x) => {c.questions[0]!.question += x;}], ["question.answer", (c, x) => {c.questions[0]!.answer += x;}]];
  const attacks = {decimal: " Dívida R$ {divida-total},{basket-free} mi.", digits: " Dívida R$ {divida-total}{basket-free} mi.", sign: " Dívida R$ -{divida-total} mi.",
    yearAsMoney: " Dívida R$ 2027 mi.", yearAsAmount: " Dívida de 2027 milhões.", wrongUnit: " Dívida de R$ {divida-total}x."};

  /** An independent reader of the final text: its own tokenizer and its own reading of the unit around each
   * number, matched to a reading of the same display and unit, a deadline, a year or month after a date
   * preposition, or an ordinal; and every material fact found by its display and unit. */
  function oracle(p: ReturnType<typeof packet>) {
    const v = current(p), d = p.result.discussion!;
    const texts = [v.summary, ...v.pages.flatMap((x) => [x.title, ...x.lines, x.recommendation ?? "", ...x.options]), ...v.deliberations.flatMap((x) => [x.title, x.text, ...x.deadlines.map((t) => t.action)]),
      ...v.questions.flatMap((x) => [x.question, x.answer]), ...v.appendix.map((x) => x.label)];
    const labels = d.identity.filter((x) => x.unit === "text").map((x) => x.display);
    const deadlines = new Set(v.deliberations.flatMap((x) => x.deadlines.map((t) => t.display)));
    const unitOf = (before: string, after: string, token: string) => {
      if (/^\d{1,2}\/[a-z]{3}$/.test(token)) return "date_day_month";
      if (/^[a-z]{3}\/\d{2}$/.test(token)) return "date_month_year";
      if (after.startsWith("%")) return "percent";
      if (/^x(?![a-zà-ú])/.test(after)) return "multiple";
      if (/R\$ $/.test(before) && /^ (milhão|milhões|mi)(?![a-zà-ú])/.test(after)) return "brl_millions";
      if (/(R\$|US\$|€) ?$/.test(before) || /^ ?(reais|real|bilh|p\.p\.)/.test(after)) return "foreign";
      if (/^ (ano|anos)(?![a-zà-ú])/.test(after)) return "years";
      if (/^ (mês|meses)(?![a-zà-ú])/.test(after)) return "months";
      if (/^ (ponto|pontos)(?![a-zà-ú])/.test(after)) return "bps";
      if (/^ (milhão|milhões|mi|mil)(?![a-zà-ú])/.test(after)) return "foreign";
      return "number";
    };
    const bad: string[] = [], seen = new Set<string>();
    for (const t of texts) {
      let rest = t;
      for (const label of labels) rest = rest.split(label).join(" ");
      for (const m of rest.matchAll(/\d{1,2}\/[a-z]{3}(?![a-zà-ú])|(?<![a-zà-ú])[a-z]{3}\/\d{2}(?!\d)|[-−]?\d+(?:[.,]\d+)*/g)) {
        const token = m[0], before = rest.slice(0, m.index), after = rest.slice(m.index! + token.length), unit = unitOf(before, after, token);
        const reading = d.identity.find((x) => x.display === token && (x.unit === unit || (x.unit === "number" && unit === "number")));
        if (reading) {seen.add(`${reading.display}|${reading.unit}`); continue;}
        if (unit === "date_day_month" && deadlines.has(token)) continue;
        const calendar = (/^(?:19|20)\d{2}$/.test(token) && unit === "number") || unit === "date_month_year";
        if (calendar && /(?:^|\s)(de|em|até|desde|para|entre|a|e|no|na|do|da) $/.test(before)) continue;
        if (unit === "number" && /^\d{1,2}$/.test(token) && (/(^|\()$/.test(before)) && /^(\.|\))/.test(after)) continue;
        bad.push(`${token}:${unit}`);
      }
    }
    const missing = d.materialFacts.figures.filter((id) => {const x = d.identity.find((i) => i.figureId === id); return x !== undefined && !seen.has(`${x.display}|${x.unit}`);});
    return {bad, missing};
  }

  it("regression r2: every attack in every displayed field family is refused on the final text", () => {
    for (const [family, set] of families) for (const [kind, add] of Object.entries(attacks))
      expect(() => packet(2, (c) => set(c, add)), `${family} ${kind}`).toThrow(/board_capital_(rendered_number_invalid|number_without_origin)/);
  });
  it("regression r2: a subject that is not shown cannot stand in for the facts, in either order of requests", () => {
    for (const order of [["peak-date", "label-economy"], ["label-economy", "peak-date"]]) {
      const p = packet(2, (c) => {
        c.deliberations[0]!.subject = "decidir com payback de {payback} anos e fluxo de R$ {peak-need} milhões; VPLs de R$ {npv-economy} milhões, R$ {npv-capex} milhões, R$ {npv-slow} milhão";
        c.omissions = order.map((id, i) => ({id: `pedido-${i}`, target: "figure" as const, targetId: id, requestedBy: "Presidente, para deixar o texto mais leve"}));
      });
      expect(p.readings!.omissions.map((o) => o.outcome)).toEqual(["refused", "refused"]);
      const text = JSON.stringify(current(p));
      for (const n of ["Payback de cerca de 6 anos", "R$ -21,7 milhões", "R$ -6,4 milhões", "R$ -2,1 milhões", "R$ -1,0 milhão"]) expect(text).toContain(n);
      expect(oracle(p)).toEqual({bad: [], missing: []});
    }
  });
  it("property: any accepted mix of requests and injected numbers reads clean to an independent oracle (fixed seed)", () => {
    const r = random(4722);
    let probe: CaseData | null = null;
    boardPacketInput(3, (c) => {probe = structuredClone(c);});
    const pages = probe!.pages.map((p) => p.id), figures = [...Object.keys(auroraBoardReadings), "stages-npv"];
    const deadlines = probe!.deliberations.flatMap((d) => d.deadlines.map((t) => `${d.id}.${t.id}`));
    let refused = 0, accepted = 0;
    for (let run = 0; run < 30; run++) {
      const omissions = Array.from({length: Math.floor(r() * 4)}, (_, i) => {
        const target = pick(r, ["recommendation", "page", "figure", "figure", "deadline"] as const);
        const targetId = target === "figure" ? pick(r, figures) : target === "deadline" ? pick(r, deadlines) : pick(r, pages);
        return {id: `pedido-${i}`, target, targetId, requestedBy: "Presidente do conselho"};
      });
      const inject = r() < 0.6 ? [pick(r, families), pick(r, [...Object.values(attacks), " Retorno de {irr}% e {lev-dez26}x.", " Caixa de R$ {min-cash} milhões."])] as const : null;
      let p: ReturnType<typeof packet> | null = null;
      try {p = packet(3, (c) => {c.omissions = omissions; if (inject) inject[0][1](c, inject[1]);});} catch (error) {
        expect(String(error)).toMatch(/board_capital_/); refused++; continue;
      }
      accepted++;
      expect(oracle(p), JSON.stringify({omissions, inject: inject?.[1]})).toEqual({bad: [], missing: []});
      expect(p.readings!.material!.allFiguresMatch && p.readings!.material!.materialFactsShown).toBe(true);
    }
    expect(refused).toBeGreaterThan(0); expect(accepted).toBeGreaterThan(0);
  });

  it("regression r3: unit, scale and calendar attacks are refused in all eleven field families (44 cases)", () => {
    const r3 = {billions: " Dívida R$ {divida-total} bilhões.", monthsForYears: " Prazo de {wal} meses.", reais: " A dívida é de {year:2027} reais.", spacedPercent: " A taxa é de {year:2027} % ao ano."};
    let refused = 0;
    for (const [family, set] of families) for (const [kind, add] of Object.entries(r3)) {
      expect(() => packet(2, (c) => set(c, add)), `${family} ${kind}`).toThrow(/board_capital_(rendered_number_invalid|number_without_origin|unit_missing)/);
      refused++;
    }
    expect(refused).toBe(44);
  });
  it("regression r3: a financial field of the source read as text is refused (three disguised readings)", () => {
    const disguised: [string, [string, string, string, string, string]][] = [
      ["principal-as-text", ["tabela-divida", "result.table.reconciliation.principal", "text", "0", "0"]],
      ["spread-as-text", ["recebiveis", "readings.options[id=risco-sacado-a].spreadOverDi", "text", "0", "0"]],
      ["npv-as-text", ["linha-embalagem", "comparison.metrics[caseId=base].netPresentValue", "text", "0", "0"]]];
    for (const [id, reading] of disguised)
      expect(() => packet(2, (c) => {c.extraReadings[id] = reading; c.pages[1]!.lines[0] += ` Dívida total de US$ {${id}} milhões.`;}), id).toThrow(`board_capital_text_reading_not_a_label:${id}`);
  });
  it("the independent oracle reads the calibration clean at every turn", () => {
    for (const turn of [2, 3] as const) expect(oracle(packet(turn, () => undefined))).toEqual({bad: [], missing: []});
  });
});
