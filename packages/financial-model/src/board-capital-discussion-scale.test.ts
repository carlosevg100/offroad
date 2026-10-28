import {describe, expect, it} from "vitest";
import {prepareBoardCapitalDiscussionPacket} from "./board-capital-discussion-packet";
import {boardPacketInput, boardPacketViaPremises, boardShownTexts} from "./board-capital-discussion-runs.test-support";
import {auroraBoardFacts, inReaisBasis, withBoardSource} from "./board-capital-discussion.test-support";
import {prepareDebtTablePacket} from "./debt-table-packet";
import {auroraDebtTableBasis} from "./debt-table.test-support";
import {prepareWeeklyCashPacket} from "./weekly-cash-packet";
import {auroraWeeklyCashBasis} from "./weekly-cash.test-support";
import {boardEffectiveScale, boardFieldOf} from "./board-capital-discussion-sources";
import {boardTemplates, type BoardCondition, type BoardOperand} from "./board-capital-discussion-templates";
import {renderBoardRef, type BoardFigureDisplay, type BoardSourceReading} from "./board-capital-discussion";

type Packet = ReturnType<typeof prepareBoardCapitalDiscussionPacket>;
/** Everything the material shows and every number it checks, without the identities of the results (fingerprints). */
const material = (p: Packet) => ({texts: boardShownTexts(p), status: p.status, gaps: p.gaps,
  numbers: p.result.discussion!.identity.map((x) => [x.figureId, x.unit, x.presentation, x.rounded, x.stated, x.display])});
const question = "Monta a tabela de dívida com tudo que temos.";
/** The debt table and the weekly cash executed again by their own methods on their bases adopted in reais. */
const debtTableInReais = () => prepareDebtTablePacket({schemaVersion: "debt-table-packet-input.v1", question, analysis: inReaisBasis(auroraDebtTableBasis()).seal()}) as unknown as Record<string, unknown>;
const weeklyInReais = () => {
  const b = inReaisBasis(auroraWeeklyCashBasis());
  return prepareWeeklyCashPacket({schemaVersion: "weekly-cash-packet-input.v1", question: "Como fica o caixa semana a semana?", analysis: b.seal()}) as unknown as Record<string, unknown>;
};

describe("board discussion money scale by source", {timeout: 900000}, () => {
  it("a money field has no scale of its own: it takes the scale its source declares, and a source without one is refused", () => {
    const spec = boardFieldOf("build-company-debt-table", "result.table.reconciliation.principal")!;
    expect(spec.scale).toBe("source");
    expect(boardEffectiveScale(spec, {id: "t", moneyScale: "reais"})).toBe("reais");
    expect(boardEffectiveScale(spec, {id: "t", moneyScale: "millions"})).toBe("millions");
    expect(() => boardEffectiveScale(spec, {id: "t"})).toThrow("board_capital_source_money_scale_missing:t");
    expect(boardEffectiveScale(boardFieldOf("measure-covenant-headroom", "result.headroom.limits[0].maximumRatio") ?? {kind: "multiple", scale: "native", period: "none", formats: []}, {id: "c"})).toBe("native");
  });

  it("the same debt table with its basis in reais gives exactly the material of the calibration in millions", () => {
    const calibrated = prepareBoardCapitalDiscussionPacket(boardPacketInput(2));
    const reais = withBoardSource("tabela-divida", debtTableInReais(), () => prepareBoardCapitalDiscussionPacket(boardPacketInput(2)), "reais");
    expect(reais.status).toBe("partial");
    expect(material(reais)).toEqual(material(calibrated));
    // Not vacuous: the debt table's readings are on the material, read from values a million times larger.
    const principal = reais.result.discussion!.identity.find((x) => x.sourceId === "tabela-divida" && x.unit === "money")!;
    const before = calibrated.result.discussion!.identity.find((x) => x.figureId === principal.figureId)!;
    expect(principal.scale).toBe("reais");
    expect(before.scale).toBe("millions");
    expect(Number(principal.value)).toBe(Number(before.value) * 1000000);
    expect(principal.packetFingerprint).not.toBe(before.packetFingerprint);
  });

  it("two sources of different scales (debt table in reais, weekly cash in reais, covenant and plan in millions) give the calibration's material, through the full path", () => {
    const calibrated = prepareBoardCapitalDiscussionPacket(boardPacketViaPremises(2));
    const mixed = withBoardSource("tabela-divida", debtTableInReais(), () => withBoardSource("caixa-semanal", weeklyInReais(),
      () => prepareBoardCapitalDiscussionPacket(boardPacketViaPremises(2)), "reais"), "reais");
    expect(material(mixed)).toEqual(material(calibrated));
    const scales = new Map(mixed.result.sources.map((s) => [s.id, s.moneyScale]));
    // Not vacuous: both rescaled sources are read on the material, from values a million times larger.
    for (const id of ["tabela-divida", "caixa-semanal"]) {
      const x = mixed.result.discussion!.identity.find((i) => i.sourceId === id && i.unit === "money")!, y = calibrated.result.discussion!.identity.find((i) => i.figureId === x.figureId)!;
      expect(Number(x.value)).toBe(Number(y.value) * 1000000);
    }
    expect(Object.fromEntries(scales)).toMatchObject({"tabela-divida": "reais", "caixa-semanal": "reais", covenant: "millions", "plano-2027": "millions", "linha-embalagem": "reais"});
  });

  it("a source declared in the wrong scale for its values is refused at its first money reading, never shown silently", () => {
    // Values in millions declared as reais: the reading shows a millionth of the stated number.
    expect(() => withBoardSource("tabela-divida", debtTableInReais(), () => prepareBoardCapitalDiscussionPacket(boardPacketInput(2)), "millions"))
      .toThrow(/board_capital_figure_diverges/);
    // Values in reais declared as millions: a million times the stated number.
    const calibratedTable = boardPacketInput(2).analysis.sources.find((s) => s.id === "tabela-divida")!.packet;
    expect(() => withBoardSource("tabela-divida", JSON.parse(calibratedTable), () => prepareBoardCapitalDiscussionPacket(boardPacketInput(2)), "reais"))
      .toThrow(/board_capital_figure_diverges/);
    // The premises name the scale with the result; a source without it is not adopted.
    const facts = auroraBoardFacts(2) as unknown as {sources: {value: Record<string, unknown>}[]};
    delete facts.sources[0]!.value.moneyScale;
    expect(() => boardPacketViaPremises(2, () => undefined, undefined, (f) => {(f as unknown as typeof facts).sources = facts.sources;})).toThrow(/moneyScale/);
  });

  it("every money comparison is in one scale: readings of a source in reais against readings of a source in millions, and constants that declare their scale", () => {
    const DT = "build-company-debt-table", WC = "project-weekly-cash";
    const reading = (id: string, methodId: string, moneyScale: "reais" | "millions", packet: unknown) =>
      ({id, methodId, methodVersion: "v", executorVersion: null, packetSchemaVersion: "v", packetFingerprint: "f", moneyScale, status: "s", gaps: [], packet}) as BoardSourceReading;
    // The debt table in reais (2.459 and 1 million by year), the weekly cash in millions (minimum of 2,5 million).
    const sources = [reading("t", DT, "reais", {result: {table: {profile: {scheduleByYear: [{year: 2026, principal: "2459000"}, {year: 2027, principal: "1000000"}]}}}}),
      reading("w", WC, "millions", {result: {weekly: {minimumCash: "2.5"}}})];
    const figures = new Map<string, BoardFigureDisplay>([
      ["x", {display: "R$ 2,46 milhões", unit: "money", origin: {sourceId: "t", methodId: DT, path: "result.table.profile.scheduleByYear[year=2026].principal", value: "2459000"}}],
      ["y", {display: "R$ 2,5 milhões", unit: "money", origin: {sourceId: "w", methodId: WC, path: "result.weekly.minimumCash", value: "2.5"}}]]);
    const render = (...when: BoardCondition[]) => renderBoardRef("zz.scale|x=x|y=y", {figures, deliberations: [], nextMeetingDate: null, sources, library: {...boardTemplates,
      "zz.scale": {text: "Valores {x} e {y}.", use: ["page.line"], when, slots: {x: {type: "money", from: [[DT, "result.table.profile.scheduleByYear[year=$a].principal"]]},
        y: {type: "money", from: [[WC, "result.weekly.minimumCash"]]}}} as (typeof boardTemplates)[string]}}).display;
    const lt = (a: BoardOperand, b: BoardOperand): BoardCondition => ({compare: [a, "lt", b]});
    // Raw, 2.459.000 would not be below 2,5; in one scale it is, and the other way round it is refused.
    expect(render(lt({slot: "x"}, {slot: "y"}))).toBe("Valores R$ 2,46 milhões e R$ 2,5 milhões.");
    expect(() => render(lt({slot: "y"}, {slot: "x"}))).toThrow("board_capital_template_condition_failed:zz.scale:0");
    expect(render(lt({slot: "x"}, {at: [WC, "result.weekly.minimumCash"]}))).toContain("Valores");
    expect(render({every: [DT, "result.table.profile.scheduleByYear", "principal"], op: "lt", than: {slot: "y"}})).toContain("Valores");
    expect(() => render({every: [DT, "result.table.profile.scheduleByYear", "principal"], op: "gt", than: {slot: "y"}})).toThrow("board_capital_template_condition_failed");
    // A constant against money declares its scale; zero needs none; an undeclared one is never compared.
    expect(render(lt({slot: "x"}, {value: "2.5", scale: "millions"}))).toContain("Valores");
    expect(render(lt({slot: "x"}, {value: "2500000", scale: "reais"}))).toContain("Valores");
    expect(render({compare: [{slot: "x"}, "gt", {value: "0"}]})).toContain("Valores");
    expect(() => render(lt({slot: "x"}, {value: "2.5"}))).toThrow("board_capital_template_condition_undefined:zz.scale:0");
    // The shown values are compared in reais too: 2,46 against 2,5 keeps the order, 2,5 against 2,5 does not.
    const tie = new Map(figures); tie.set("x", {...figures.get("x")!, display: "R$ 2,5 milhões"} as BoardFigureDisplay);
    expect(() => renderBoardRef("zz.scale|x=x|y=y", {figures: tie, deliberations: [], nextMeetingDate: null, sources, library: {...boardTemplates,
      "zz.scale": {text: "Valores {x} e {y}.", use: ["page.line"], when: [lt({slot: "x"}, {slot: "y"})], slots: {x: {type: "money", from: [[DT, "result.table.profile.scheduleByYear[year=$a].principal"]]},
        y: {type: "money", from: [[WC, "result.weekly.minimumCash"]]}}} as (typeof boardTemplates)[string]}})).toThrow("board_capital_display_order_lost:zz.scale:0");
  });
});
