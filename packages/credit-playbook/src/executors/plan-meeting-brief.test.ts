import {describe, expect, it} from "vitest";

import {planMeetingBrief, type BriefInput} from "./plan-meeting-brief";

const fp = (seed: string) => seed.padEnd(64, "0");
const objects: BriefInput["objects"] = [
  {id: "ledger-01", kind: "debt_ledger", state: "complete", fingerprint: fp("a1"), headlines: ["Dívida bruta de 5.670.186 em 31/05/2026; contratual líquida de 4.228.477"]},
  {id: "wall-01", kind: "maturity_wall", state: "complete", fingerprint: fp("b2"), headlines: ["Dois picos: 1.229.828 em 2026/27 e 1.228.475 em 2028/29"]},
  {id: "cov-01", kind: "covenants", state: "conditioned", fingerprint: fp("c3"), headlines: ["4,72x pró forma contra 4,00x, medição em 28/02/2027; degrau condicionado à quitação dos CRA"]},
  {id: "rec-01", kind: "reconciliation", state: "open_divergences", fingerprint: fp("d4"), headlines: ["Dividendos com quatro valores; estoques em três apresentações"]},
  {id: "exit-01", kind: "exit_costs", state: "complete", fingerprint: fp("e5"), headlines: []},
  {id: "ba-01", kind: "before_after", state: "complete", fingerprint: fp("f6"), headlines: ["Alongar as séries DI suaviza 2028/29"]},
  {id: "sc-01", kind: "scenarios", state: "complete", fingerprint: fp("a7"), headlines: []},
  {id: "blocked-01", kind: "interest_schedule", state: "blocked", fingerprint: fp("b8"), headlines: ["must not appear"]},
];
const turn1 = (): BriefInput => ({
  caseId: "gc01-analista-ib-camil",
  request: {turn: 1, audience: ["vp"], form: "first_deliverable", sponsorInstruction: "Ele falou em refinanciamento, mas não disse que tese quer levar nem que formato espera."},
  objects,
  candidateQuestions: [
    {id: "q-angle", text: "Leitura de refinanciamento ou alternativas mais amplas?", changesTheWork: "define o universo de alternativas", answeredByDocuments: false, priority: 0},
    {id: "q-meeting", text: "Reunião exploratória ou produto a testar?", changesTheWork: "define profundidade e forma", answeredByDocuments: false, priority: 1},
    {id: "q-format", text: "Briefing interno, páginas de pitch ou análise com cenários?", changesTheWork: "define o material", answeredByDocuments: false, priority: 2},
    {id: "q-itr-date", text: "Qual é a data do último ITR?", changesTheWork: "nenhuma", answeredByDocuments: true, priority: 0},
    {id: "q-fourth", text: "Quem vai à reunião?", changesTheWork: "tom", answeredByDocuments: false, priority: 9},
  ],
});

describe("plan-meeting-brief executor", () => {
  it("turn 1: fills the deliverable only from usable objects, names the gaps, and asks at most three questions the documents do not answer", () => {
    const result = planMeetingBrief(turn1());
    expect(result.ambiguityNamed).toMatch(/angle and format undefined/);
    expect(result.deliverable.objectsUsed).not.toContain("blocked-01");
    const debt = result.deliverable.blocks.find((block) => block.id === "debt_by_instrument")!;
    expect(debt.state).toBe("filled");
    expect(debt.headlines[0]).toMatch(/5\.670\.186/);
    const company = result.deliverable.blocks.find((block) => block.id === "company_view")!;
    expect(company.state).toBe("gap");
    expect(company.gap).toMatch(/named as a gap, not written/);
    const liquidity = result.deliverable.blocks.find((block) => block.id === "liquidity_coverage")!;
    expect(liquidity.state).toBe("gap");
    expect(result.alignmentQuestions.map((question) => question.id)).toEqual(["q-angle", "q-meeting", "q-format"]);
    expect(result.refusedQuestions[0]?.id).toBe("q-itr-date");
    expect(result.pagePlan).toBeNull();
  });

  it("turn 2: proposes the three-page plan and allows production only once the plan is confirmed", () => {
    const turn2: BriefInput = {...turn1(), request: {turn: 2, audience: ["vp", "companhia"], form: "pitch_pages", pages: 3, sponsorInstruction: "Meu VP quer três páginas de pitch."}, candidateQuestions: []};
    const proposed = planMeetingBrief(turn2);
    expect(proposed.pagePlan?.state).toBe("proposed");
    expect(proposed.pagePlan?.productionAllowed).toBe(false);
    expect(proposed.pagePlan?.pages.map((page) => page.title)).toEqual(["Situação atual", "Alternativas", "Impacto nos indicadores"]);
    const confirmed = planMeetingBrief({...turn2, request: {...turn2.request, confirmedPlanId: proposed.pagePlan!.id}});
    expect(confirmed.pagePlan?.state).toBe("confirmed");
    expect(confirmed.pagePlan?.productionAllowed).toBe(true);
    const stale = planMeetingBrief({...turn2, request: {...turn2.request, audience: ["vp"], confirmedPlanId: proposed.pagePlan!.id}});
    expect(stale.pagePlan?.state).toBe("proposed");
  });

  it("is consistent under permutations of objects and questions", () => {
    const first = planMeetingBrief(turn1());
    for (let seed = 1; seed <= 20; seed += 1) {
      const shuffled = turn1();
      shuffled.objects = [...shuffled.objects].reverse();
      shuffled.candidateQuestions = seed % 2 ? [...shuffled.candidateQuestions!].reverse() : shuffled.candidateQuestions;
      const again = planMeetingBrief(shuffled);
      expect(again.trace.inputFingerprint).toBe(first.trace.inputFingerprint);
      expect(again.trace.outputFingerprint).toBe(first.trace.outputFingerprint);
    }
  });
});
