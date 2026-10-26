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
    expect(r.persisting).toEqual([{causeId: "trigo", until: "2026-12-31"}, {causeId: "prazo-redes", until: "2026-12-31"}]);
    expect([r.tightestWeek.prior.weekStart, n(r.tightestWeek.prior.closing), r.tightestWeek.updated.weekStart, n(r.tightestWeek.updated.closing)]).toEqual(["2026-12-21", "7.5", "2026-12-21", "4.2"]);
    expect([n(r.shortfallToMinimum.prior), n(r.shortfallToMinimum.updated)]).toEqual(["7.5", "10.8"]);
    expect(r.topUp).toMatchObject({facilityId: "conta-garantida", limit: "10", needExceedsLimit: true, fullLimitCovers: false});
    expect(n(r.topUp!.fullLimitMinimum.closing)).toBe("14.2");
    expect(r.action.steps.map((s) => [s.facilityId, n(s.amount), s.withinLimit])).toEqual([["programas-redes", "23.0", true], ["conta-garantida", "4.8", true]]);
    expect([r.action.withinApproved, r.action.covers]).toEqual([true, true]);
    expect([n(r.covenant.ratio.prior, 2), n(r.covenant.ratio.updated, 2), n(r.covenant.trailingEbitda.prior), n(r.covenant.trailingEbitda.updated)]).toEqual(["2.20", "2.32", "54.5", "53.5"]);
    expect(r.covenant.byLimit.map((l) => [l.limitId, n(l.ebitdaHeadroom.prior), n(l.ebitdaHeadroom.updated)])).toEqual([["aditamento", "13.8", "11.5"], ["politica", "6.2", "3.7"]]);
    expect(r.decisionsChanged).toEqual(["short_term_financing", "covenant_headroom", "third_party_material"]);
    expect([r.updated, r.unchanged, r.stale]).toEqual([["caixa-semanal", "covenant-dez26", "projecao-2026"], ["tabela-divida", "plano-2027", "linha-embalagem"], ["material-sondagem"]]);
    expect(r.openQuestions).toEqual([{causeId: "prazo-redes", question: "Os 54 dias das redes são prazo negociado ou atraso?"}]);
    expect([r.priorVersionsKept, r.sentToThirdParties, p.grantsPublication]).toEqual([true, false, false]);
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
  it("refuses an update of a version other than the one it names", () => {
    const b = auroraQuarterUpdateBasis();
    b.set("prior.weeklyCash.fingerprint", {type: "text", value: "0".repeat(64)});
    expect(() => packet(b)).toThrow("quarter_update_prior_version_mismatch");
  });
  it("is deterministic", () => {
    expect(packet().fingerprint).toBe(packet().fingerprint);
  });
});
