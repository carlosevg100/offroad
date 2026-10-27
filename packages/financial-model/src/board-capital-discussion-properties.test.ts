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
});
