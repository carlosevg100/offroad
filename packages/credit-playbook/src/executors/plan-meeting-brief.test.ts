import {describe, expect, it} from "vitest";

import {contractMismatch} from "./contract";

import {createHash} from "node:crypto";

import {planMeetingBrief, type BriefInput} from "./plan-meeting-brief";

/** Fingerprints derived from the object's own content, as the executors that produce the objects would compute them. */
const fp = (seed: string) => createHash("sha256").update(JSON.stringify({object: seed})).digest("hex");
const headline = (text: string, stance: "for" | "against" | "neutral", seed: string, unit: string | null = null, objectPath = "headline") => ({text, stance, objectFingerprint: fp(seed), unit, objectPath});
const objects = (): BriefInput["objects"] => [
  {id: "ledger-01", kind: "debt_ledger", state: "complete", fingerprint: fp("a1"), unit: "R$ mil", headlines: [headline("Dívida bruta de 5.670.186 em 31/05/2026; contratual líquida de 4.228.477", "neutral", "a1", "R$ mil", "gross_debt")]},
  {id: "wall-01", kind: "maturity_wall", state: "diagnosed", fingerprint: fp("b2"), unit: "R$ mil", headlines: [headline("Dois picos: 1.229.828 em 2026/27 e 1.228.475 em 2028/29", "against", "b2", "R$ mil", "walls"), headline("Caixa e equivalentes mais aplicações financeiras de 1.455.809 excedem em 225.981 o principal de 2026/27; cobertura aritmética, não disponibilidade em D0", "for", "b2", "R$ mil", "coverage.by_period[0]")]},
  {id: "cov-01", kind: "covenants", state: "conditioned", fingerprint: fp("c3"), unit: null, headlines: [headline("4,72x pró forma contra os degraus de 3,50x (enquanto os CRA de referência vivem) e 4,00x (condicionado à prova da quitação ordinária); medição em 28/02/2027; comparabilidade condicionada à abertura do EBITDA e às informações complementares da companhia", "against", "c3", "x", "covenants[0].index")]},
  {id: "rec-01", kind: "reconciliation", state: "open_divergences", fingerprint: fp("d4"), unit: "R$ mil", headlines: [headline("Dividendos com quatro valores; estoques em três apresentações", "against", "d4", null, "open_divergences")]},
  {id: "exit-01", kind: "exit_costs", state: "complete", fingerprint: fp("e5"), unit: "R$ mil", headlines: []},
  {id: "ba-01", kind: "before_after", state: "compared", fingerprint: fp("f6"), unit: "R$ mil", headlines: [headline("Alongar as séries DI suaviza 2028/29", "for", "f6", null, "ranking")]},
  {id: "sc-01", kind: "scenarios", state: "declared", fingerprint: fp("a7"), unit: "R$ mil", headlines: []},
  {id: "blocked-01", kind: "interest_schedule", state: "blocked", fingerprint: fp("b8"), unit: "R$ mil", headlines: [headline("must not appear", "for", "b8", null, "rows")]},
];
const itr = {document: "01_ITR_1T26_31mai2026.pdf", page: 1};
const turn1 = (): BriefInput => ({
  caseId: "gc01-analista-ib-camil",
  request: {turn: 1, audience: {primary: "vp"}, form: "first_deliverable", sponsorInstruction: "Ele falou em refinanciamento, mas não disse que tese quer levar nem que formato espera.", undefinedAspects: ["thesis", "format"]},
  objects: objects(),
  candidateQuestions: [
    {id: "q-angle", text: "Leitura de refinanciamento ou alternativas mais amplas?", changesTheWork: "define o universo de alternativas", coverage: {searched: ["01_ITR_1T26_31mai2026.pdf", "release_1T26.pdf"], answeredBy: null, answer: null}, priority: 0},
    {id: "q-meeting", text: "Reunião exploratória ou produto a testar?", changesTheWork: "define profundidade e forma", coverage: {searched: ["01_ITR_1T26_31mai2026.pdf"], answeredBy: null, answer: null}, priority: 1},
    {id: "q-format", text: "Briefing interno, páginas de pitch ou análise com cenários?", changesTheWork: "define o material", coverage: {searched: ["01_ITR_1T26_31mai2026.pdf"], answeredBy: null, answer: null}, priority: 2},
    {id: "q-itr-date", text: "Qual é a data do último ITR?", changesTheWork: "define a data-base", coverage: {searched: ["01_ITR_1T26_31mai2026.pdf"], answeredBy: itr, answer: "31/05/2026, capa do ITR"}, priority: 0},
    {id: "q-trivial", text: "Qual a cor do template?", changesTheWork: "nenhuma", coverage: {searched: ["01_ITR_1T26_31mai2026.pdf"], answeredBy: null, answer: null}, priority: 0},
    {id: "q-fourth", text: "Quem vai à reunião?", changesTheWork: "tom do material", coverage: {searched: ["01_ITR_1T26_31mai2026.pdf"], answeredBy: null, answer: null}, priority: 9},
    {id: "q-unsearched", text: "Qual é o EBITDA dos últimos doze meses?", changesTheWork: "define a alavancagem", priority: 0},
  ],
});
const block = (result: ReturnType<typeof planMeetingBrief>, id: string) => result.deliverable.blocks.find((entry) => entry.id === id)!;

describe("plan-meeting-brief executor", () => {
  it("turn 1: fills blocks only from usable objects, names conditioned objects as gaps, and asks at most three questions the base does not answer", () => {
    const result = planMeetingBrief(turn1());
    expect(result.schema_version).toBe("method.plan-meeting-brief.v5");
    expect(result.ambiguity_named).toMatch(/which format is expected; which thesis to carry/);
    expect(result.deliverable.objects_used).not.toContain("blocked-01");
    expect(result.deliverable.objects_pending).toEqual([{id: "cov-01", state: "conditioned"}, {id: "rec-01", state: "open_divergences"}]);
    expect(result.deliverable.objects_excluded).toEqual([{id: "blocked-01", state: "blocked"}]);
    expect(block(result, "debt_by_instrument").state).toBe("filled");
    expect(block(result, "debt_by_instrument").headlines[0]?.object_fingerprint).toBe(fp("a1"));
    expect(block(result, "company_view").gap).toMatch(/no usable object of kind company_view/);
    expect(block(result, "liquidity_coverage").gap).toMatch(/interest_schedule: blocked-01 is blocked|no usable object of kind interest_schedule/);
    expect(result.alignment_questions.map((question) => question.id)).toEqual(["q-angle", "q-meeting", "q-format"]);
    expect(result.refused_questions.map((question) => question.id)).toEqual(["q-fourth", "q-itr-date", "q-trivial", "q-unsearched"]);
    expect(result.refused_questions.find((question) => question.id === "q-unsearched")?.reason).toMatch(/no search of the base is declared/);
    expect(result.deliverable.objects_used).toEqual(["ba-01", "ledger-01", "wall-01"]);
    expect(result.deliverable.objects_usable_not_cited).toEqual(["exit-01", "sc-01"]);
    expect(result.not_produced_here[0]).toMatch(/prose of the pages/);
    expect(result.refused_questions.find((question) => question.id === "q-itr-date")?.answered_by).toEqual(itr);
    expect(result.refused_questions.find((question) => question.id === "q-trivial")?.reason).toMatch(/does not change the work/);
    expect(result.page_plan.state).toBe("not_requested");
    expect(result.state).toBe("planned");
    expect(result.uncovered_terms.map((term) => term.id)).toContain("company_view");
    expect(block(result, "debt_by_instrument").headlines[0]?.object_path).toBe("gross_debt");
    expect(result.uncovered_terms.find((term) => term.id === "object:cov-01")?.reason).toMatch(/3,50x .* 4,00x .* abertura do EBITDA/);
    // A usable object without facts does not fill a block, and a conditioned object is carried as an uncovered term with its finding.
    expect(block(result, "assumptions").state).toBe("gap");
    expect(block(result, "assumptions").gap).toMatch(/sc-01 usable but without facts/);
    expect(result.uncovered_terms.find((term) => term.id === "object:cov-01")?.reason).toMatch(/is conditioned; its findings are carried as conditions.*4,72x pró forma contra os degraus de 3,50x/);
    expect(block(result, "points_against_thesis").label).toBe("Pontos contra a tese");
  });

  it("emits the deliverable without audience or form and leaves the page plan waiting", () => {
    const result = planMeetingBrief({...turn1(), request: {turn: 1, audience: null, form: null}});
    expect(block(result, "debt_by_instrument").state).toBe("filled");
    expect(result.page_plan.state).toBe("awaiting_audience_and_form");
    expect(result.page_plan.reason).toMatch(/waits for the audience and the form/);
    expect(result.state).toBe("planned");
    expect(() => planMeetingBrief({...turn1(), request: {turn: 1, audience: null, form: null, pages: 3}})).toThrow(/no page plan/);
  });

  it("refuses a fact with a thousands figure and no unit, a unit that contradicts the fact's words, and duplicate blocks in the previous version", () => {
    const missingUnit = turn1();
    missingUnit.objects[0] = {...missingUnit.objects[0]!, headlines: [headline("Dívida bruta de 5.670.186", "neutral", "a1")]};
    expect(() => planMeetingBrief(missingUnit)).toThrow(/needs its unit/);
    const wrongUnit = turn1();
    wrongUnit.objects[0] = {...wrongUnit.objects[0]!, headlines: [headline("Dívida bruta de 5.670.186 (R$ mil)", "neutral", "a1", "R$ milhões")]};
    expect(() => planMeetingBrief(wrongUnit)).toThrow(/says thousands and its unit says millions/);
    // The unit of a quoted figure must be the unit of the object, whatever the words of the fact.
    const silentRelabel = turn1();
    silentRelabel.objects[0] = {...silentRelabel.objects[0]!, headlines: [headline("Dívida bruta de 5.670.186", "neutral", "a1", "R$ milhões")]};
    expect(() => planMeetingBrief(silentRelabel)).toThrow(/quotes a figure in R\$ milhões and the object states its figures in R\$ mil/);
    const breach = turn1();
    breach.objects[2] = {...breach.objects[2]!, state: "resolved", headlines: [headline("Covenant rompido: 4,72x contra 4,00x", "against", "c3", "x")]};
    expect(() => planMeetingBrief(breach)).toThrow(/asserts a breach or a default/);
    const noPath = turn1();
    noPath.objects[0] = {...noPath.objects[0]!, headlines: [{text: "Dívida bruta de 5.670.186", stance: "neutral", objectFingerprint: fp("a1"), unit: "R$ mil"} as unknown as NonNullable<BriefInput["objects"][number]["headlines"]>[number]]};
    expect(() => planMeetingBrief(noPath)).toThrow();
    const duplicateBlocks = turn1();
    duplicateBlocks.previousVersion = {outputFingerprint: fp("ff"), blocks: [{id: "company_view", state: "gap", objectIds: []}, {id: "company_view", state: "filled", objectIds: ["x-01"]}], objectFingerprints: {}};
    expect(() => planMeetingBrief(duplicateBlocks)).toThrow(/duplicate block company_view/);
  });

  it("splits points for and against by the stance each object declared, never by the block a kind belongs to", () => {
    const result = planMeetingBrief(turn1());
    const forThesis = block(result, "points_for_thesis");
    const against = block(result, "points_against_thesis");
    expect(forThesis.headlines.map((entry) => entry.object_id).sort()).toEqual(["ba-01", "wall-01"]);
    expect(against.headlines.map((entry) => entry.object_id)).toEqual(["wall-01"]);
    expect(against.pending_object_ids).toEqual(["cov-01", "rec-01"]);
    expect(against.headlines.some((entry) => /4,72x/.test(entry.text))).toBe(false);
    // A usable object of any kind with an against stance enters the against block: kinds never decide the side.
    const withScenario = turn1();
    withScenario.objects = withScenario.objects.map((object) => (object.id === "sc-01" ? {...object, headlines: [headline("No cenário sem rolagem, 2027/28 abre déficit de 150.887", "against", "a7", "R$ mil")]} : object));
    expect(block(planMeetingBrief(withScenario), "points_against_thesis").headlines.map((entry) => entry.object_id)).toEqual(["sc-01", "wall-01"]);
  });

  it("refuses a headline bound to another fingerprint and a duplicate id", () => {
    const tampered = turn1();
    tampered.objects[0] = {...tampered.objects[0]!, headlines: [headline("Dívida bruta de 9.999", "neutral", "zz")]};
    expect(() => planMeetingBrief(tampered)).toThrow(/bound to another fingerprint/);
    const duplicate = turn1();
    duplicate.objects = [...duplicate.objects, {...duplicate.objects[0]!}];
    expect(() => planMeetingBrief(duplicate)).toThrow(/duplicate object ledger-01/);
  });

  it("turn 2: honours the pages asked, proposes the plan with the primary audience's discriminator, and allows production only once that plan is confirmed", () => {
    const turn2 = (): BriefInput => ({...turn1(), request: {turn: 2, audience: {primary: "vp", others: ["companhia"]}, form: "pitch_pages", pages: 3, sponsorInstruction: "Meu VP quer três páginas de pitch."}, candidateQuestions: []});
    const proposed = planMeetingBrief(turn2());
    expect(proposed.state).toBe("awaiting_confirmation");
    expect(proposed.page_plan.state).toBe("proposed");
    expect(proposed.page_plan.production_allowed).toBe(false);
    expect(proposed.page_plan.pages.map((page) => page.title)).toEqual(["Situação atual", "Alternativas", "Impacto nos indicadores"]);
    expect(proposed.page_plan.discriminator).toMatch(/decision of vp comes first; companhia read the same pages/);
    const confirmed = planMeetingBrief({...turn2(), request: {...turn2().request, confirmedPlanId: proposed.page_plan.id}});
    expect(confirmed.page_plan.state).toBe("confirmed");
    expect(confirmed.page_plan.production_allowed).toBe(true);
    expect(confirmed.state).toBe("planned");
    const stale = planMeetingBrief({...turn2(), request: {...turn2().request, audience: {primary: "companhia", others: ["vp"]}, confirmedPlanId: proposed.page_plan.id}});
    expect(stale.page_plan.state).toBe("proposed");
    expect(stale.page_plan.reason).toMatch(/differs from this one/);
    const two = planMeetingBrief({...turn2(), request: {...turn2().request, pages: 2}});
    expect(two.page_plan.pages).toHaveLength(2);
    expect(two.page_plan.pages[1]?.blocks).toEqual(["initial_alternatives", "points_for_thesis", "assumptions", "exhibits"]);
    const five = planMeetingBrief({...turn2(), request: {...turn2().request, pages: 5}});
    expect(five.page_plan.pages).toHaveLength(5);
    expect(five.page_plan.pages.flatMap((page) => page.blocks)).toEqual(proposed.page_plan.pages.flatMap((page) => page.blocks));
    const nine = planMeetingBrief({...turn2(), request: {...turn2().request, pages: 9}});
    expect(nine.page_plan.state).toBe("unsupported");
    // The question the method promises is asked, not only announced, and the open questions block carries it.
    expect(nine.alignment_questions.map((question) => question.id)).toContain("q-pages-exceed-blocks");
    expect(block(nine, "open_questions").state).toBe("filled");
    const noQuestions = planMeetingBrief({...turn1(), candidateQuestions: []});
    expect(block(noQuestions, "open_questions").state).toBe("gap");
    expect(noQuestions.uncovered_terms.map((term) => term.id)).toContain("open_questions");
    expect(() => planMeetingBrief({...turn1(), request: {...turn1().request, pages: 3}})).toThrow(/no page plan/);
  });

  it("writes a change note against the previous version instead of rewriting silently", () => {
    const first = planMeetingBrief(turn1());
    const next = turn1();
    next.objects = next.objects.map((object) => (object.id === "wall-01" ? {...object, fingerprint: fp("b9"), headlines: object.headlines!.map((entry) => ({...entry, objectFingerprint: fp("b9")}))} : object)).filter((object) => object.id !== "ba-01");
    next.previousVersion = {outputFingerprint: first.trace.outputFingerprint, blocks: first.deliverable.blocks.map((entry) => ({id: entry.id, state: entry.state, objectIds: entry.object_ids})), objectFingerprints: Object.fromEntries(turn1().objects.map((object) => [object.id, object.fingerprint]))};
    const result = planMeetingBrief(next);
    expect(result.change_note?.previous_output_fingerprint).toBe(first.trace.outputFingerprint);
    expect(result.change_note?.changes).toContain("block initial_alternatives moved from filled to gap");
    expect(result.change_note?.changes.some((change) => /object wall-01 changed/.test(change))).toBe(true);
    expect(result.change_note?.changes).toContain("object ba-01 left since the previous version");
    expect(planMeetingBrief(turn1()).change_note).toBeNull();
  });

  it("is consistent under permutations of objects, headlines (ties in text included), questions, audience members, previous-version blocks and key order", () => {
    const base = (): BriefInput => {
      const input = turn1();
      input.request = {...input.request, audience: {primary: "vp", others: ["companhia", "md", "associado"]}};
      input.objects = input.objects.map((object) => (object.id === "wall-01" ? {...object, headlines: [...object.headlines!, headline("Dois picos: 1.229.828 em 2026/27 e 1.228.475 em 2028/29", "against", "b2", "R$ mil", "peak"), headline("Dois picos: 1.229.828 em 2026/27 e 1.228.475 em 2028/29", "neutral", "b2", "R$ mil", "walls")]} : object));
      input.previousVersion = {outputFingerprint: fp("ff"), blocks: [{id: "debt_by_instrument", state: "filled", objectIds: ["ledger-01"]}, {id: "company_view", state: "gap", objectIds: []}], objectFingerprints: {"ledger-01": fp("a1"), "wall-01": fp("b0")}};
      return input;
    };
    const first = planMeetingBrief(base());
    const permute = <T>(items: readonly T[], seed: number): T[] => { const copy = [...items]; let state = seed; for (let index = copy.length - 1; index > 0; index -= 1) { state = (state * 1103515245 + 12345) % 2147483648; const swap = state % (index + 1); [copy[index], copy[swap]] = [copy[swap]!, copy[index]!]; } return copy; };
    const reversedKeys = <T,>(value: T): T => (Array.isArray(value) ? value.map(reversedKeys) as T : value && typeof value === "object" ? Object.fromEntries(Object.entries(value as Record<string, unknown>).reverse().map(([key, inner]) => [key, reversedKeys(inner)])) as T : value);
    for (let seed = 1; seed <= 20; seed += 1) {
      const shuffled = base();
      shuffled.objects = permute(shuffled.objects, seed).map((object) => ({...object, headlines: permute(object.headlines ?? [], seed + 1)}));
      shuffled.candidateQuestions = permute(shuffled.candidateQuestions!, seed + 2).map((question) => (question.coverage ? {...question, coverage: {...question.coverage, searched: permute(question.coverage.searched, seed + 6)}} : question));
      shuffled.request = {...shuffled.request, audience: {primary: "vp", others: permute(["companhia", "md", "associado"], seed + 3)}, undefinedAspects: permute(["format", "thesis"], seed + 4)};
      shuffled.previousVersion = {...shuffled.previousVersion!, blocks: permute(shuffled.previousVersion!.blocks, seed + 5)};
      const again = planMeetingBrief(seed % 2 ? reversedKeys(shuffled) : shuffled);
      expect(again.trace.inputFingerprint).toBe(first.trace.inputFingerprint);
      expect(again.trace.outputFingerprint).toBe(first.trace.outputFingerprint);
    }
  });

  it("emits exactly the top-level outputs the method declares", () => {
    expect(contractMismatch(planMeetingBrief(turn1()) as unknown as Record<string, unknown>, "materials/plan-meeting-brief.md")).toEqual([]);
  });
});
