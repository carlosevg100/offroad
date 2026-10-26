import {beforeAll, describe, expect, it} from "vitest";
import {proposeProjectionChallengeHypotheses, type ProjectionChallengeFacts} from "@offroad/financial-model";
import {buildProjectionChallengePremiseProposal, completeProjectionChallengeFacts, proposeProjectionChallengePremisesForTurn, shouldProposeProjectionChallengePremises,
  type ProjectionChallengeExtraction} from "./projection-challenge-premises-proposal";
import {itemKeys} from "./lote2-premises";
import {comparableHypotheses, financialModelFixture, nonAnswering, summaryGroups, summaryOrigins, turnWithIntent} from "./lote2-premises.test-support";

let aurora: () => ProjectionChallengeFacts;
beforeAll(async () => {aurora = (await financialModelFixture<{auroraProjectionFacts: () => ProjectionChallengeFacts}>("projection-challenge.test-support.ts")).auroraProjectionFacts;});
const none = {value: null, origin: null, source: null};
const said = (o: string) => o === "document" ? "document" as const : "informed" as const;
const sourcedOf = <T>(f: {value: T; origin: string; source: string} | null) => f === null ? none : {value: f.value, origin: said(f.origin), source: f.source};

/** The turn of ficha C26 as the extraction would read it from the plan's model and the house projection by drivers. */
function auroraExtraction(f: ProjectionChallengeFacts): ProjectionChallengeExtraction {
  const kase = (c: ProjectionChallengeFacts["plan"]) => ({origin: said(c.origin), source: c.source, ...c.value});
  return {turnIntent: "answers_pending", periods: sourcedOf(f.periodIds), targetPeriod: sourcedOf(f.targetPeriodId), unitConvention: sourcedOf(f.unitConvention),
    plan: kase(f.plan), reference: kase(f.reference),
    assumptions: f.assumptions.map((a) => ({label: a.term.value.label, origin: said(a.term.origin), source: a.term.source, drivers: a.term.value.drivers,
      ruler: a.ruler.value, evidence: a.evidence.value, evidenceStatus: a.evidenceStatus.value})),
    capacityQuantity: sourcedOf(f.capacity?.maximumQuantity ?? null), capacityInvestmentInPlan: sourcedOf(f.capacity?.investmentInPlan ?? null),
    marginCause: sourcedOf(f.marginCause), requestedReceivableDays: sourcedOf(f.requestedReceivableDays), premiumOverAverage: sourcedOf(f.premiumOverAverage)};
}
const idsOf = (f: ProjectionChallengeFacts) => ({challengeId: f.challengeId, entityId: f.entityId, definitionVersionId: f.definitionVersionId});
const renameOf = (f: ProjectionChallengeFacts) => new Map(itemKeys(f.assumptions.map((a) => a.term.value.label)).map((k, n) => [k, f.assumptions[n]!.term.value.id] as [string, string]));
const complete = (e: ProjectionChallengeExtraction, f: ProjectionChallengeFacts) => {
  const c = completeProjectionChallengeFacts({extraction: e, ids: idsOf(f), currency: "BRL"});
  if (c.status !== "complete") throw new Error(JSON.stringify(c));
  return c;
};

describe("projection challenge premises proposed from a turn", () => {
  it("recognizes the ficha C26 questions, with or without documents, and not a request to build or a conceptual question", () => {
    for (const m of ["Que premissas você questionaria nessa projeção?", "Esse plano está otimista?", "Revisa a projeção que vamos mandar para o banco, sem rodar nada novo.",
      "O que o banco vai contestar nesse business plan?"]) for (const docs of [false, true]) expect(shouldProposeProjectionChallengePremises(m, docs), m).toBe(true);
    for (const m of ["Me ajuda a montar o business plan.", "O que é uma projeção por drivers?", "Monta um deck com a projeção para o banco."])
      for (const docs of [false, true]) expect(shouldProposeProjectionChallengePremises(m, docs), m).toBe(false);
  });
  it("takes the CFO's defense of the price as a continuation candidate", () => {
    const earlier = ["Que premissas você questionaria nessa projeção?"];
    expect(shouldProposeProjectionChallengePremises("O preço vem da linha premium que lançamos em março. Ela é 25% mais cara.", false, earlier)).toBe(true);
    expect(shouldProposeProjectionChallengePremises("Qual é a capacidade da fábrica?", false, earlier)).toBe(false);
  });
  it("completes the Aurora facts and proposes the hypotheses the fixture proposes", () => {
    const f = aurora(), c = complete(auroraExtraction(f), f);
    expect(c.housePremiseKeys).toEqual([]);
    expect(comparableHypotheses(proposeProjectionChallengeHypotheses(c.facts), renameOf(f))).toEqual(comparableHypotheses(proposeProjectionChallengeHypotheses(f)));
  });
  it("groups the drivers that differ when the plan describes no assumption, with the house yardsticks", () => {
    const f = aurora(), e = auroraExtraction(f);
    e.assumptions = []; e.targetPeriod = none; e.unitConvention = none;
    const c = complete(e, f);
    expect(c.facts.assumptions.map((a) => a.term.value.drivers)).toEqual([["quantity"], ["netUnitPrice"], ["fixedCosts"], ["receivableDays", "maintenanceCapex"]]);
    // Grouped by the house, so the terms carry the house origin (independent review, round 2).
    expect(c.facts.assumptions.every((a) => a.term.origin === "house")).toBe(true);
    expect(c.facts.assumptions.every((a) => a.ruler.origin === "house" && a.evidenceStatus.value === "not_presented")).toBe(true);
    expect(c.facts.targetPeriodId).toMatchObject({value: "2028", origin: "house"});
    expect(c.housePremiseKeys.sort()).toEqual(["assumptions", "evidenceStatus", "rulers", "targetPeriod", "unitConvention"]);
  });
  it("asks for the reference, the plan and a driver claimed twice in one batch", () => {
    const f = aurora(), e = auroraExtraction(f);
    e.reference = null; e.plan!.fixedCosts = null; e.assumptions[1]!.drivers = ["quantity"];
    expect(completeProjectionChallengeFacts({extraction: e, ids: idsOf(f), currency: "BRL"})).toEqual({status: "missing", missing: ["plan.fixedCosts", "reference", "assumptions.drivers"]});
  });
  it("asks for a tax rate the plan does not state instead of filling one under the plan's document (independent review, round 1)", () => {
    const f = aurora(), e = auroraExtraction(f);
    e.plan!.taxRate = null;
    expect(completeProjectionChallengeFacts({extraction: e, ids: idsOf(f), currency: "BRL"})).toEqual({status: "missing", missing: ["plan.taxRate"]});
    e.reference!.taxRate = null;
    expect(completeProjectionChallengeFacts({extraction: e, ids: idsOf(f), currency: "BRL"})).toEqual({status: "missing", missing: ["plan.taxRate", "reference.taxRate"]});
  });
  it("builds the card summary, field paths the store accepts and a stable fingerprint", () => {
    const f = aurora(), c = complete(auroraExtraction(f), f), proposal = buildProjectionChallengePremiseProposal(c.facts);
    expect(proposal.summary).toMatchObject({situationId: "stable-business-high-conversion", referenceDate: "2028-12-31"});
    expect(proposal.summary.items.every((x) => summaryGroups.includes(x.group) && summaryOrigins.includes(x.origin))).toBe(true);
    expect(proposal.summary.items.map((x) => x.labelKey ?? x.group)).toEqual(["referenceCase", "planCase", "assumption", "assumption", "assumption", "assumption", "capacity", "requestedReceivableDays"]);
    expect(proposal.hypotheses.every((h) => /^projection_challenge\.[0-9a-f-]{36}\.[A-Za-z0-9_.-]{1,200}$/.test(h.fieldPath))).toBe(true);
    expect(proposal).toMatchObject({methodId: "challenge-financial-projection", methodVersion: "2026.10.26-v1"});
  });
  it("proposes only when the extraction reads the turn as answering", async () => {
    const earlier = ["Que premissas você questionaria nessa projeção?"];
    for (const intent of nonAnswering)
      expect(await turnWithIntent(proposeProjectionChallengePremisesForTurn, auroraExtraction(aurora()), intent, "Mando o modelo amanhã", earlier), intent)
        .toEqual({extracted: true, status: null, events: ["projection_challenge_premises.not_answering"]});
    expect(await turnWithIntent(proposeProjectionChallengePremisesForTurn, auroraExtraction(aurora()), "answers_pending", earlier[0]!, [])).toMatchObject({status: "proposed"});
  });
});
