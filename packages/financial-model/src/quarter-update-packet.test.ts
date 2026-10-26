import {describe, expect, it} from "vitest";
import {prepareQuarterUpdatePacket} from "./quarter-update-packet";
import {auroraQuarterUpdateBasis} from "./quarter-update.test-support";
import {calculateAdoptedWeeklyCash} from "./adopted-weekly-cash";

const question = "Fechou o trimestre. Atualiza tudo.";
const packet = (b = auroraQuarterUpdateBasis()) => prepareQuarterUpdatePacket({schemaVersion: "quarter-update-packet-input.v1", question, analysis: b.seal()});
const n = (v: string | null | undefined, p = 1) => Number(v).toFixed(p);
describe("quarter update packet", {timeout: 180000}, () => {
  it("says what changed, why, what persists and what it changes", () => {
    const p = packet(), r = p.readings!;
    expect(p.status).toBe("prepared_for_human_review");
    expect(r.deviations.filter((d) => ["ebitda", "caixa"].includes(d.lineId)).map((d) => [d.lineId, d.deviation])).toEqual([["ebitda", "-0.4"], ["caixa", "-1.7"]]);
    expect(r.bridges.map((b) => [b.lineId, b.residual, b.causes.map((c) => [c.id, c.amount, c.classification])])).toEqual([
      ["ebitda", "0", [["volume", "0.5", "calendar"], ["trigo", "-0.6", "structural"], ["frete-energia", "-0.3", "calendar"]]],
      ["caixa", "0", [["ebitda-abaixo", "-0.4", "calendar"], ["prazo-redes", "-2.1", "structural"], ["estoque-trigo", "-1.6", "calendar"], ["impostos-outros", "2.4", "calendar"]]]]);
    expect(r.persisting.map((c) => [c.causeId, c.until, c.nature, c.ebitdaAhead, c.cashAhead])).toEqual([["trigo", "2026-12-31", "flow", "-0.6", "-0.6"], ["prazo-redes", "2026-12-31", "balance", "0", "0"]]);
    expect(r.balanceShiftsCarriedOnce).toEqual([{causeId: "prazo-redes", amount: "-2.1"}]);
    expect([r.tightestWeek.prior.weekStart, n(r.tightestWeek.prior.closing), r.tightestWeek.updated.weekStart, n(r.tightestWeek.updated.closing, 2)]).toEqual(["2026-12-21", "7.5", "2026-12-21", "4.39"]);
    expect([n(r.shortfallToMinimum.prior), n(r.shortfallToMinimum.updated, 2)]).toEqual(["7.5", "10.61"]);
    expect(r.topUp).toMatchObject({facilityId: "conta-garantida", limit: "10", needExceedsLimit: true, fullLimitCovers: false});
    expect(n(r.topUp!.fullLimitMinimum.closing, 2)).toBe("14.39");
    expect(r.action.steps.map((s) => [s.facilityId, n(s.amount, 2), s.withinLimit])).toEqual([["programas-redes", "23.00", true], ["conta-garantida", "4.61", true]]);
    expect([r.action.withinApproved, r.action.covers]).toEqual([true, true]);
    expect([n(r.projectedEbitda.prior), n(r.projectedEbitda.updated)]).toEqual(["54.5", "53.5"]);
    expect(r.decisionsChanged).toEqual(["short_term_financing", "covenant_headroom", "third_party_material"]);
    expect([r.updated, r.unchanged, r.stale, r.ownedElsewhere]).toEqual([["caixa-semanal", "covenant-dez26", "covenant-dez26-gerencial", "projecao-2026"],
      ["tabela-divida", "plano-2027", "linha-embalagem"], ["material-sondagem"], []]);
    expect(r.openQuestions).toEqual([{causeId: "prazo-redes", question: "Os 54 dias das redes são prazo negociado ou atraso?"}]);
    expect([r.priorVersionsKept, r.sentToThirdParties, p.grantsPublication]).toEqual([true, false, false]);
  });
  it("reads the covenant by the indenture and by the board's managerial definition, naming the definition behind each headroom", () => {
    const c = packet().readings!.covenant;
    expect(c.measurements.map((m) => [m.measurementId, m.definitionRead, n(m.ratio.prior, 2), n(m.ratio.updated, 2)])).toEqual([
      ["dez26-base", "Definição da escritura (CVM 156 menos arrendamentos)", "2.20", "2.29"], ["dez26-gerencial", "Definição gerencial adotada pelo conselho", "2.04", "2.12"]]);
    expect(c.headroom.map((h) => [h.measurementId, h.limitId, n(h.ebitdaHeadroom.prior), n(h.ebitdaHeadroom.updated), h.limitDefinition !== null])).toEqual([
      ["dez26-base", "aditamento", "13.8", "12.0", true], ["dez26-base", "politica", "6.2", "4.3", true], ["dez26-gerencial", "politica", "10.2", "8.3", true]]);
    expect(c.anyBreach).toBe(false);
  });
  it("keeps the prior weekly cash exactly as its released reader measured it", () => {
    const b = auroraQuarterUpdateBasis(), p = packet(b);
    const released = calculateAdoptedWeeklyCash(b.prior.weeklyCash);
    expect(p.result.update!.weekly.prior).toEqual(released.weekly);
    expect(p.result.prior.weeklyCash).toMatchObject({resultFingerprint: released.fingerprint, complete: true});
  });
  it("names a residual the causes do not explain", () => {
    const b = auroraQuarterUpdateBasis();
    b.set("cause.impostos-outros.amount", {type: "number", value: "2"});
    const p = packet(b);
    expect(p.status).toBe("partial");
    expect(p.readings!.bridges.find((x) => x.lineId === "caixa")!.residual).toBe("0.4");
    expect(p.gaps.some((g) => g.operand.endsWith(".bridge.caixa") && g.reason === "unexplained_residual")).toBe(true);
  });
  it("review r1: dropping the weekly series of the structural causes is a gap, never sufficiency", () => {
    const b = auroraQuarterUpdateBasis();
    (b.input as unknown as {streamUpdates: unknown[]}).streamUpdates = [];
    const p = packet(b);
    expect(p.status).toBe("partial");
    expect(p.gaps.filter((g) => g.reason === "structural_cause_not_in_weekly_cash").map((g) => g.operand.split(".").at(-1))).toEqual(["trigo", "prazo-redes"]);
    expect(n(p.readings!.projectedEbitda.updated)).toBe("53.5");
  });
  it("review r1: the persistence date bounds every effect, the weekly series included", () => {
    const c = auroraQuarterUpdateBasis();
    c.set("cause.trigo.until", {type: "date", value: "2026-10-03"});
    const p = packet(c), r = p.readings!;
    expect(n(r.persisting.find((x) => x.causeId === "trigo")!.ebitdaAhead, 4)).toBe("-0.0196");
    expect(n(r.persisting.find((x) => x.causeId === "trigo")!.weeklyEffect, 3)).toBe("-0.058");
    expect(n(r.projectedEbitda.updated, 2)).toBe("54.08");
  });
  it("review r1: an open receivable-days diagnosis without its question is a gap", () => {
    const b = auroraQuarterUpdateBasis();
    (b.input as unknown as {bridges: {causes: {id: string; question: unknown}[]}[]}).bridges[1]!.causes.find((x) => x.id === "prazo-redes")!.question = null;
    const p = packet(b);
    expect(p.status).toBe("partial");
    expect(p.gaps.some((g) => g.operand.endsWith(".cause.prazo-redes") && g.reason === "structural_cause_question_missing")).toBe(true);
  });
  it("review r3: an affected dependent owned elsewhere is information, unless the question names it", () => {
    const b = auroraQuarterUpdateBasis();
    b.set("cause.trigo.until", {type: "date", value: "2027-03-31"});
    const seal = b.seal();
    const p = prepareQuarterUpdatePacket({schemaVersion: "quarter-update-packet-input.v1", question, analysis: seal});
    expect(p.status).toBe("prepared_for_human_review");
    expect(p.readings!.ownedElsewhere).toEqual([{dependentId: "plano-2027", owner: "build-operating-projection"}, {dependentId: "linha-embalagem", owner: "analyze-investment-project"}]);
    const asked = prepareQuarterUpdatePacket({schemaVersion: "quarter-update-packet-input.v1", question: "E o plano de 2027?", analysis: seal, askedDependentIds: ["plano-2027"]});
    expect(asked.status).toBe("partial");
    expect(asked.gaps.map((g) => g.reason)).toEqual(["asked_dependent_not_recomputed"]);
  });
  it("refuses an update of a version other than the one it names", () => {
    const b = auroraQuarterUpdateBasis();
    b.set("prior.weeklyCash.fingerprint", {type: "text", value: "0".repeat(64)});
    expect(() => packet(b)).toThrow("quarter_update_prior_version_mismatch");
  });
  it("is deterministic", () => {
    expect(packet().fingerprint).toBe(packet().fingerprint);
  });
});
