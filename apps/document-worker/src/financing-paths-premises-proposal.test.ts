import {beforeAll, describe, expect, it} from "vitest";
import {capitalPathsKernelFromFacts, composeBoundCapitalPaths, prepareCapitalPathsPacket, proposeCapitalPathsHypotheses, type CapitalPathsFacts, type CapitalPathsPacket} from "@offroad/financial-model";
import {amountInMillions, buildFinancingPathsPremiseProposal, completeFinancingPathsFacts, financingPathsContradictions, financingPathsEntry, financingPathsReader,
  proposeFinancingPathsPremisesForTurn, shouldProposeFinancingPathsPremises, type FinancingPathsExtraction} from "./financing-paths-premises-proposal";
import {inMemoryBasis, type BoundBasis} from "./lote3-reader-check";
import {financialModelFixture, nonAnswering, summaryGroups, summaryOrigins, turnWithIntent} from "./lote2-premises.test-support";

type Kernel = ReturnType<typeof capitalPathsKernelFromFacts>;
type Support = {auroraCapitalPathsKernel: () => Kernel; auroraCapitalPathsFacts: () => CapitalPathsFacts; auroraCapitalPathsBasis: () => {seal: () => unknown};
  capitalPathsQuestion: string};
let support: Support;
beforeAll(async () => {support = await financialModelFixture<Support>("capital-structure-paths.test-support.ts");});

// The ficha C32 conversation, verbatim, and the answer turn the bridge needs before a card.
const turn1 = "Precisamos financiar a linha nova de embalagem e reduzir a pressão dos vencimentos dos próximos dois anos. Que caminhos fazem sentido?";
const turn2 = "Seguem a escritura e o contrato do Bradesco. A linha é de fornecedor nacional, R$ 18 milhões: R$ 10 em novembro e dezembro e R$ 8 no começo de 2027, entra em operação em maio. Hoje a embalagem é terceirizada; a conta interna é uma economia de uns R$ 6 milhões por ano. Não temos conversa aberta com bancos. Os sócios preferem não dar aval. A safra consome uns R$ 25 milhões de outubro a dezembro.";
const answer = "Seguem a projeção trimestral, a análise da linha com as variantes, a ata do conselho de março, a base anual de 2029 a 2033 e as indicações de preço. Caixa mínimo de R$ 15 milhões. Pode comparar os sete caminhos que listei, com o alongamento bancário sem a linha e o Bradesco alongado sem a linha como apoio; sondagem até 31/10, decisão da rota até 15/11 e gatilho de CDI mais 3,0.";
const turn3 = "O presidente considera a linha estratégica: quer depender menos do fornecedor. E se a gente fizer mesmo assim?";
const turn4 = "Uma debênture de R$ 80 milhões me parece grande para a gente. E se eu só alongar o Bradesco com ele mesmo, por mais dois anos?";
const asOf = "2026-08-14";
const project = "a0000000-0000-4000-8000-000000000001";

const dayAfter = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
const chargeLabels: Record<string, string> = {comissao: "Comissão", iof: "IOF", tarifa: "Tarifa", emissao: "Emissão", waiver: "Waiver", anuencia: "Anuência"};
const doc = (source: string) => ({origin: "document" as const, source});
const none = {value: null, origin: null, source: null};

/** What a correct extraction reads from every document and message of the C32 case once all were sent, in millions
 * as the documents write them. The status quo path is the method's own and is never stated. */
function auroraExtraction(k: Kernel): FinancingPathsExtraction {
  const f = support.auroraCapitalPathsFacts(), ends = k.periodEnds, start = (n: number) => n === 0 ? dayAfter(k.openingDate) : dayAfter(ends[n - 1]!);
  const labelOf = (id: string) => k.instruments.find((i) => i.id === id)!.label;
  const origin = (o: string, source: string) => o === "document" ? doc(source) : {origin: "informed" as const, source};
  const sparse = (values: readonly string[]) => values.flatMap((v, n) => v === "0" ? [] : [{periodEnd: ends[n]!, amount: v}]);
  const dated = (values: readonly string[], id: string) => values.flatMap((v, n) => v === "0" ? [] : [{date: id === "ccb-bradesco" && n === 4 ? "2027-09-15" : ends[n]!, amount: v}]);
  const steps = (rates: readonly string[]): {from: string | null; rate: string}[] => rates.flatMap((r, n): {from: string | null; rate: string}[] => n === 0 ? [{from: null, rate: r}] : r === rates[n - 1] ? [] : [{from: start(n), rate: r}]);
  const equal = (shares: {year: number; share: string}[]) => shares.every((s) => s.share === shares[0]!.share) && shares.every((s, n) => s.year === shares[0]!.year + n);
  const instruments = k.instruments.map((i) => {
    const src = f.instruments.find((x) => x.value.id === i.id)!, a = i.afterHorizon;
    return {label: i.label, ...origin(src.origin, src.source), scale: "milhoes" as const, role: i.role, replacesLabel: i.replaces ? labelOf(i.replaces) : null, lenderKind: i.lenderKind,
      openingPrincipal: i.openingPrincipal, finalPaymentDate: i.finalPaymentDate, rateKind: i.rate.kind,
      rates: steps(i.rate.kind === "fixed" ? i.rate.annualRates : i.rate.spreads), interestEvery: i.interestEvery, monthlyAmortization: i.couponBase === "average_principal",
      draws: dated(i.draws, i.id), amortization: dated(i.principal, i.id),
      charges: i.charges.map((c) => ({label: chargeLabels[c.id]!, date: c.periodEnd, category: c.category, amount: c.amount})),
      security: i.security, prepayment: i.prepayment,
      afterHorizon: a.kind === "scheduled" ? (equal(a.shares) ? {kind: "equal_annual" as const, fromYear: a.shares[0]!.year, toYear: a.shares.at(-1)!.year} : {kind: "shares" as const, shares: a.shares}) : a,
      alternativeProfiles: a.kind === "scheduled" ? a.alternatives.map((x) => ({label: x.label, fromYear: x.shares[0]!.year, toYear: x.shares.at(-1)!.year})) : []};
  });
  const variantLabel = (id: string) => k.projectVariants.find((v) => v.id === id)!;
  return {turnIntent: "answers_pending",
    openingDate: {value: k.openingDate, ...doc("Gerencial de junho de 2026")}, openingCash: {value: {amount: k.openingAvailable, scale: "milhoes"}, ...doc("Gerencial de junho de 2026")},
    minimumCash: {value: {amount: k.minimumCash, scale: "milhoes"}, origin: "informed", source: "Caixa mínimo de cerca de duas semanas de desembolso, informado pelo CFO"},
    taxRate: {value: k.tax.rate, ...doc("Demonstrações de 2025: lucro real")},
    periods: ends.map((periodEnd, n) => ({periodEnd, ebitda: k.operating.ebitda[n]!, depreciation: k.operating.depreciation[n]!, leasePayments: k.operating.leasePayments[n]!,
      workingCapitalCashFlow: k.operating.workingCapitalCashFlow[n]!, maintenanceCapex: k.operating.maintenanceCapex[n]!, scale: "milhoes" as const, ...doc("projecao-trimestral.xlsx")})),
    diCurve: {value: {byPeriod: ends.map((periodEnd, n) => ({periodEnd, rate: k.index.annualByPeriod[n]!})), afterHorizon: k.index.afterHorizon.map((x) => ({year: x.year, rate: x.annualRate}))},
      ...doc("projecao-trimestral.xlsx, curva DI de referência")},
    variants: k.projectVariants.filter((v) => v.effects).map((v) => ({label: v.label, ...doc("analise-linha-embalagem.xlsx"), scale: "milhoes" as const,
      effects: ends.map((periodEnd, n) => ({periodEnd, ebitda: v.effects!.ebitda[n]!, depreciation: v.effects!.depreciation[n]!, maintenanceCapex: v.effects!.maintenanceCapex[n]!,
        growthCapex: v.effects!.growthCapex[n]!, startupWorkingCapitalCashFlow: v.effects!.startupWorkingCapitalCashFlow[n]!}))})),
    stress: none,
    indenture: {value: {limit: k.covenant.indenture.limit, comparator: k.covenant.indenture.comparator, measurementMonths: [12], ebitdaExcludesLeases: k.covenant.ebitdaExcludesLeases},
      ...doc(k.covenant.indenture.source)},
    covenantHistory: k.covenant.history.map((h) => ({label: h.id.toUpperCase(), months: h.months, ebitda: h.ebitda, leasePayments: h.leasePayments, scale: "milhoes" as const, ...doc("Gerencial do 1S26, CVM 156")})),
    boardPolicy: {status: "stated", limit: k.covenant.policy!.limit, comparator: k.covenant.policy!.comparator, measurementMonths: [12], ownDefinition: null, ...doc(k.covenant.policy!.source)},
    basket: {status: "stated", holderLabel: labelOf(k.basket!.holderId), limit: k.basket!.limit, basis: k.basket!.basis, occupied: k.basket!.occupied, scale: "milhoes", ...doc(k.basket!.source)},
    instruments,
    paths: k.paths.filter((p) => p.role !== "status_quo").map((p) => ({label: p.label, origin: "informed" as const, source: "Caminhos pedidos pelo CFO", scale: "milhoes" as const, role: p.role,
      projectVariantLabel: variantLabel(p.projectVariantId).effects ? variantLabel(p.projectVariantId).label : null, withoutProject: !variantLabel(p.projectVariantId).effects,
      instrumentLabels: p.instrumentIds.map(labelOf), prepayments: p.prepayments.map((x) => ({instrumentLabel: labelOf(x.instrumentId), date: x.periodEnd})),
      charges: p.charges.map((c) => ({label: chargeLabels[c.id]!, instrumentLabel: labelOf(c.instrumentId), date: c.periodEnd, category: c.category, amount: c.amount}))})),
    postHorizon: k.postHorizon.years.map((year, n) => ({year, ebitda: k.postHorizon.ebitda[n]!, leasePayments: k.postHorizon.leasePayments[n]!, maintenanceCapex: k.postHorizon.maintenanceCapex[n]!,
      workingCapitalInvestment: k.postHorizon.workingCapitalInvestment[n]!, depreciation: k.postHorizon.depreciation[n]!, otherInterest: k.postHorizon.otherInterest[n]!, scale: "milhoes" as const,
      ...doc("Base anual de 2029 a 2033 (capacidade de endividamento)")})),
    maximumSpread: {value: k.plan.maximumSpread, origin: "informed", source: "Gatilho informado pelo CFO"},
    soundingBy: {value: k.plan.soundingBy, origin: "informed", source: "Data informada pelo CFO"}, routeDecisionBy: {value: k.plan.routeDecisionBy, origin: "informed", source: "Data informada pelo CFO"},
    sensitivities: k.sensitivities.map((s) => ({label: s.label, ...doc("Cenários da projeção por drivers"), scale: "milhoes" as const, ebitdaDelta: sparse(s.ebitdaDelta),
      workingCapitalDelta: sparse(s.workingCapitalDelta), minimumCash: s.minimumCash})),
  };
}
/** The vault of turn 1 (debt table, statements, managerial accounts): the debt in place, no contracts, no projection. */
function vaultOnly(full: FinancingPathsExtraction): FinancingPathsExtraction {
  const existing = full.instruments.filter((i) => i.role === "existing").map((i) => ({...i, prepayment: null, ...doc("Tabela de dívida de junho de 2026")}));
  return {...full, minimumCash: none, periods: [], diCurve: none, variants: [], indenture: none, boardPolicy: {status: null, limit: null, comparator: null, measurementMonths: null, ownDefinition: null,
    origin: null, source: null}, basket: {status: null, holderLabel: null, limit: null, basis: null, occupied: null, scale: null, origin: null, source: null},
    instruments: existing, paths: [], postHorizon: [], maximumSpread: none, soundingBy: none, routeDecisionBy: none, sensitivities: []};
}
/** Turn 2: the indenture and the Bradesco contract arrive; the projection, the project analysis and the paths do not. */
function withContracts(full: FinancingPathsExtraction): FinancingPathsExtraction {
  const v = vaultOnly(full);
  return {...v, indenture: full.indenture, basket: full.basket, instruments: full.instruments.filter((i) => i.role === "existing")};
}

const idsOf = (f: CapitalPathsFacts) => ({capitalPathsId: f.capitalPathsId, entityId: f.entityId, definitionVersionId: f.definitionVersionId});
const complete = (e: FinancingPathsExtraction) => {
  const c = completeFinancingPathsFacts({extraction: e, ids: idsOf(support.auroraCapitalPathsFacts()), asOf});
  if (c.status !== "complete") throw new Error(JSON.stringify(c));
  return c;
};
/** This bridge keys every record by its label; the calibration names them by hand. Position maps one onto the other. */
function renameOf(mine: Kernel, theirs: Kernel): Map<string, string> {
  const pairs: [string, string][] = [];
  const add = (a: readonly {id: string}[], b: readonly {id: string}[]) => a.forEach((x, n) => pairs.push([x.id, b[n]!.id]));
  add(mine.projectVariants, theirs.projectVariants); add(mine.instruments, theirs.instruments); add(mine.paths, theirs.paths); add(mine.sensitivities, theirs.sensitivities);
  add(mine.covenant.history, theirs.covenant.history);
  mine.instruments.forEach((i, n) => {const j = theirs.instruments[n]!;
    if (i.afterHorizon.kind === "scheduled" && j.afterHorizon.kind === "scheduled") add(i.afterHorizon.alternatives, j.afterHorizon.alternatives);});
  return new Map(pairs);
}
const renamed = <T>(value: T, map: ReadonlyMap<string, string>): T => JSON.parse(JSON.stringify(value), (_k, v: unknown) => typeof v === "string" && map.has(v) ? map.get(v) : v) as T;
const packetOf = (b: BoundBasis, question: string) => prepareCapitalPathsPacket(composeBoundCapitalPaths({...b, question}));

describe("financing paths premises from the ficha C32 conversation", {timeout: 900_000}, () => {
  it("routes the ficha phrasings and keeps neighbours out", () => {
    for (const m of [turn1, "Vence muita coisa ano que vem e ainda quero fazer o investimento. O que eu faço?", "Como financio a expansão sem apertar o caixa?",
      "Quero alongar a dívida e fazer o capex. Por onde começo?", "Não quero recomendação ainda, só me mostre os caminhos para a dívida de 2027.",
      "Preciso financiar a expansão e aliviar os vencimentos"]) for (const docs of [false, true]) expect(financingPathsEntry(m, docs, []), m).toBe("cue");
    for (const m of ["Recebemos uma proposta do Itaú para uma CCB de três anos. Vale a pena?", "Compare as propostas do Itaú e do Bradesco.", "Quanto de dívida cabe para a linha nova?",
      "Prepare o material para o conselho sobre a estrutura de capital.", "O que é uma debênture?", "Monte a tabela de dívida.", "A linha de embalagem se paga?",
      "Tenho uns 60 milhões de recebíveis. Dá para usar isso para financiar a safra em vez da linha do banco?", "Explique como funciona um alongamento.",
      "Prepare a decisão de estrutura de capital com as minutas para o banco.", turn4, turn3])
      for (const docs of [false, true]) expect(shouldProposeFinancingPathsPremises(m, docs, []), m).toBe(false);
  });
  it("continues the analysis on statements and on a what-if on a path, never on another question", () => {
    expect(financingPathsEntry(turn2, true, [turn1])).toBe("continuation");
    expect(financingPathsEntry(answer, true, [turn1, turn2])).toBe("continuation");
    expect(financingPathsEntry(turn3, false, [turn1, turn2, answer])).toBeNull();
    expect(financingPathsEntry(turn4, false, [turn1, turn2, answer, turn3])).toBe("continuation");
    // Another method's own question in between ends the continuation.
    expect(financingPathsEntry(turn2, true, [turn1, "Monte a tabela de dívida."])).toBeNull();
  });

  it("reproduces the conversation turn by turn: two batches of gaps, one card, the reader run once, the what-if answered by the same card", async () => {
    const k = support.auroraCapitalPathsKernel(), full = auroraExtraction(k);
    let runs = 0;
    const reader = (b: BoundBasis) => {runs += 1; return financingPathsReader(b);};
    const turn = (message: string, earlier: string[], extraction: FinancingPathsExtraction | null, hasAttachments = false) => {
      let extracted = false;
      return proposeFinancingPathsPremisesForTurn({message, hasAttachments, recentUserMessages: earlier, projectId: project, asOf, reader, loadEvidence: async () => [],
        extract: async () => {extracted = true; return extraction;}, log: () => undefined}).then((r) => ({r, extracted}));
    };
    // Turn 1: only the vault. The ficha asks the indenture, the Bradesco contract and the line; the bridge names them first.
    const t1 = await turn(turn1, [], vaultOnly(full));
    expect(t1.r?.forAdvisor.status).toBe("missing");
    const m1 = (t1.r!.forAdvisor as {missing: string[]}).missing;
    expect(m1.slice(0, 3)).toEqual(["indenture", "boardPolicy", "basket"]);
    for (const x of ["periods", "diCurve", "postHorizon", "minimumCash", "paths", "maximumSpread", "soundingBy", "routeDecisionBy"]) expect(m1).toContain(x);
    // Turn 2: the indenture and the contract arrive. What the ficha's adviser built itself (projection, project
    // effects, routes, trigger and dates) is asked, never filled.
    const t2 = await turn(turn2, [turn1], withContracts(full), true);
    const m2 = (t2.r!.forAdvisor as {missing: string[]}).missing;
    expect(m2).not.toContain("indenture"); expect(m2).not.toContain("basket");
    expect(m2).toEqual(["boardPolicy", "periods", "diCurve", "postHorizon", "minimumCash", "paths", "maximumSpread", "soundingBy", "routeDecisionBy"]);
    expect(runs).toBe(0);
    // The answer turn: every document and the routes; the card is proposed and the reader runs once.
    const t3 = await turn(answer, [turn1, turn2], full, true);
    expect(t3.r?.forAdvisor.status).toBe("proposed");
    expect(t3.r!.proposal!.hypotheses.length).toBe(234);
    expect(runs).toBe(1);
    // Ficha turn 3 is a question about a path already on the card: no step, no extraction.
    expect(await turn(turn3, [turn1, turn2, answer], full)).toEqual({r: null, extracted: false});
    // Ficha turn 4: a what-if continues; the Bradesco path is already stated, so the same card returns, unchecked again.
    const t5 = await turn(turn4, [turn1, turn2, answer, turn3], full);
    expect([t5.r?.forAdvisor.status, t5.r!.proposal!.fingerprint, runs]).toEqual(["proposed", t3.r!.proposal!.fingerprint, 1]);
    // A what-if on terms nobody stated: the new extension is asked, never priced by the house.
    const other = structuredClone(full);
    other.instruments.push({...other.instruments.find((i) => i.role === "amended")!, label: "CCB Bradesco alongada até 2030", origin: "informed", source: "Pedido do CFO", rates: [], charges: [],
      finalPaymentDate: null, afterHorizon: null});
    const t6 = await turn("E se eu alongar o Bradesco por mais três anos?", [turn1, turn2, answer, turn3, turn4], other);
    const n = other.instruments.length;
    expect((t6.r!.forAdvisor as {missing: string[]}).missing).toEqual([`instruments.${n}.rates`, `instruments.${n}.afterHorizon`]);
  });

  it("the confirmed card adopts the calibration: same kernel and, adopted and composed, the same packet", () => {
    const k = support.auroraCapitalPathsKernel(), c = complete(auroraExtraction(k));
    const mine = capitalPathsKernelFromFacts(c.facts), map = renameOf(mine, k);
    const ours = renamed(mine, map);
    // Only two names differ: the house variant without the project and the stress's own id, which the method does not adopt.
    expect({...ours, stress: {...ours.stress, id: k.stress.id}, projectVariants: ours.projectVariants.map((v, n) => ({...v, label: k.projectVariants[n]!.label}))}).toEqual(k);
    expect(c.housePremiseKeys.sort()).toEqual(["availableForService", "demandQuantum", "monthlyAmortizationInterest", "policyOnIndentureDefinition", "statusQuoPath", "stress", "taxLossTreatment",
      "withoutProjectVariant"]);
    const proposal = buildFinancingPathsPremiseProposal(c.facts);
    const packet = renamed(packetOf(inMemoryBasis(proposeCapitalPathsHypotheses(c.facts)), support.capitalPathsQuestion), map);
    const reference = prepareCapitalPathsPacket(support.auroraCapitalPathsBasis().seal()) as CapitalPathsPacket;
    expect([packet.status, packet.readings, packet.result.evaluation, packet.gaps]).toEqual([reference.status, reference.readings, reference.result.evaluation, reference.gaps]);
    expect([packet.readings!.recommendation!.pathId, packet.readings!.recommendation!.netDebtAtHorizon.slice(0, 5), packet.readings!.alternative!.pathId]).toEqual(["sem-linha-debenture", "79.31", "banco-sem-linha"]);
    // Ficha turns 3 and 4 read the same packet: the line costs about 23 of net debt; Bradesco alone leaves a gap of 18.23 in mid 2028.
    const path = (id: string) => packet.readings!.paths.find((p) => p.id === id)!;
    expect(Number(path("debenture-com-linha").netDebtAtHorizon) - Number(path("sem-linha-debenture").netDebtAtHorizon)).toBeGreaterThan(22);
    expect([path("bradesco-sem-linha").minimumCash.periodId, path("bradesco-sem-linha").shortfallVsPolicyMinimum.slice(0, 5)]).toEqual(["2028-06-30", "18.23"]);
    expect(proposal.summary.items.every((x) => summaryGroups.includes(x.group) && summaryOrigins.includes(x.origin))).toBe(true);
    expect(proposal.summary.items.filter((x) => x.origin === "house").map((x) => x.labelKey)).toEqual(["taxLossTreatment", "stressCase", "issueQuantum", "withoutProject", "statusQuoPath"]);
    // Independent review, round 1: the rate comes from a document; the loss treatment is the house convention, with its own origin.
    const reason = (end: string) => proposal.hypotheses.find((h) => h.fieldPath.endsWith(end))!.reason;
    expect(reason(".tax.rate")).toMatch(/^Origem: documento\./);
    expect(reason(".tax.lossTreatment")).toMatch(/^Origem: premissa da casa\./);
    expect(proposal.summary.items.find((x) => x.labelKey === "taxRate")).toMatchObject({origin: "document"});
    expect(proposal.summary.items.find((x) => x.labelKey === "taxLossTreatment")).toMatchObject({origin: "house"});
    expect(proposal.summary.items.find((x) => x.labelKey === "taxRate")!.source).not.toMatch(/conven/);
    expect(proposal.hypotheses.every((h) => /^capital_paths\.[0-9a-f-]{36}\.[A-Za-z0-9_.-]{1,200}$/.test(h.fieldPath))).toBe(true);
    expect(proposal).toMatchObject({methodId: "evaluate-financing-paths", methodVersion: "2026.10.27-v1", summary: {situationId: "refinancing", referenceDate: "2026-06-30"}});
  });
});

describe("financing paths premises: what is stated, what is asked, what is refused", () => {
  it("carries amounts into millions exactly, asks an unstated scale and refuses what does not fit", () => {
    expect([amountInMillions("62000000", "reais"), amountInMillions("1250", "milhares"), amountInMillions("-25.625", "milhoes"), amountInMillions("0.01", "reais")])
      .toEqual(["62", "1.25", "-25.625", "0.00000001"]);
    expect(amountInMillions("0.001", "reais")).toBeNull();
    const k = support.auroraCapitalPathsKernel(), e = auroraExtraction(k);
    e.periods[0] = {...e.periods[0]!, scale: null};
    e.instruments[0] = {...e.instruments[0]!, openingPrincipal: "60000000.123456789", scale: "reais"};
    const c = completeFinancingPathsFacts({extraction: e, ids: idsOf(support.auroraCapitalPathsFacts()), asOf});
    expect(c.status === "missing" ? c.missing : c).toEqual(["instruments.1.openingPrincipal", "periods.1.scale"]);
    // The same instrument written in reais is the same fact in millions.
    const reais = auroraExtraction(k); reais.instruments[0] = {...reais.instruments[0]!, scale: "reais", openingPrincipal: "60000000",
      amortization: reais.instruments[0]!.amortization!.map((x) => ({...x, amount: "15000000"}))};
    expect(capitalPathsKernelFromFacts(complete(reais).facts).instruments[0]).toEqual(capitalPathsKernelFromFacts(complete(auroraExtraction(k)).facts).instruments[0]);
  });
  it("never reads absence as zero, as none or as a house term", () => {
    const k = support.auroraCapitalPathsKernel(), e = auroraExtraction(k);
    const debenture = e.instruments.findIndex((i) => i.label === "Debênture da 2ª emissão, R$ 80 mi");
    e.instruments[debenture] = {...e.instruments[debenture]!, afterHorizon: null, interestEvery: null};
    e.instruments[0] = {...e.instruments[0]!, prepayment: null};
    e.boardPolicy = {status: null, limit: null, comparator: null, measurementMonths: null, ownDefinition: null, origin: null, source: null};
    e.paths[0] = {...e.paths[0]!, role: null};
    const c = completeFinancingPathsFacts({extraction: e, ids: idsOf(support.auroraCapitalPathsFacts()), asOf});
    expect(c.status === "missing" ? c.missing : c).toEqual(["boardPolicy", "instruments.1.prepayment", `instruments.${debenture + 1}.interestEvery`, `instruments.${debenture + 1}.afterHorizon`, "paths.1.role"]);
    // A prepayment the contract forbids and a path that prepays it contradict each other: asked.
    const forbidden = auroraExtraction(k); forbidden.instruments[0] = {...forbidden.instruments[0]!, prepayment: "none"};
    const f = completeFinancingPathsFacts({extraction: forbidden, ids: idsOf(support.auroraCapitalPathsFacts()), asOf});
    expect(f.status === "missing" ? f.missing : f).toEqual(["instruments.1.prepayment"]);
  });
  it("asks contradictions inside a record and labels stated twice with other terms", () => {
    const k = support.auroraCapitalPathsKernel();
    expect(financingPathsContradictions(auroraExtraction(k))).toEqual([]);
    const cases: [string, (e: FinancingPathsExtraction) => void][] = [
      ["stress.ebitdaFactor", (e) => {e.stress = {value: {ebitdaFactor: "1.2", fromPeriodEnd: null}, origin: "informed", source: "CFO"};}],
      ["routeDecisionBy", (e) => {e.routeDecisionBy = {...e.routeDecisionBy, value: "2026-10-01"};}],
      ["basket.occupied", (e) => {e.basket = {...e.basket, occupied: "16"};}],
      ["instruments.1.security", (e) => {e.instruments[0] = {...e.instruments[0]!, security: {kind: "none", amount: "5", countsAgainstBasket: false}};}],
      ["instruments.1.openingPrincipal", (e) => {e.instruments[0] = {...e.instruments[0]!, role: "new"};}],
      ["paths.1.projectVariantLabel", (e) => {e.paths[0] = {...e.paths[0]!, withoutProject: true};}],
    ];
    for (const [key, edit] of cases) {
      const e = auroraExtraction(k); edit(e);
      expect(financingPathsContradictions(e), key).toContain(key);
      const c = completeFinancingPathsFacts({extraction: e, ids: idsOf(support.auroraCapitalPathsFacts()), asOf});
      expect(c.status === "missing" && c.missing.includes(key), key).toBe(true);
    }
    const twice = auroraExtraction(k); twice.instruments.push({...twice.instruments[0]!, openingPrincipal: "61"});
    const c = completeFinancingPathsFacts({extraction: twice, ids: idsOf(support.auroraCapitalPathsFacts()), asOf});
    expect(c.status === "missing" && c.missing.includes(`instruments.${twice.instruments.length}.label`)).toBe(true);
    // The same instrument read twice, equal, is one.
    const same = auroraExtraction(k); same.instruments.push({...same.instruments[0]!});
    expect(complete(same).facts.instruments.length).toBe(k.instruments.length);
  });
  it("names the kernel's refusal and the reader's, and the basis limit", async () => {
    const k = support.auroraCapitalPathsKernel(), e = auroraExtraction(k);
    // A long issue labelled seasonal: the kernel refuses it by name.
    const deb = e.instruments.findIndex((i) => i.label === "Debênture da 2ª emissão, R$ 80 mi");
    e.instruments[deb] = {...e.instruments[deb]!, afterHorizon: {kind: "seasonal_release", settlementMonthsAfterDraw: 6, justification: "Rótulo sazonal"}, alternativeProfiles: []};
    const c = completeFinancingPathsFacts({extraction: e, ids: idsOf(support.auroraCapitalPathsFacts()), asOf});
    expect(c.status === "missing" ? c.missing[0] : c).toMatch(/^(kernelRefused|instruments)\./);
    // More instruments and paths than one basis holds: the turn names it, never a dropped card.
    const big = auroraExtraction(k);
    for (let n = 0; n < 3; n++) big.instruments.push({...big.instruments.find((i) => i.label === "Debênture da 2ª emissão, R$ 80 mi")!, label: `Debênture adicional ${n + 1}`});
    big.paths.push(...[1, 2, 3].map((n) => ({...big.paths.find((p) => p.label.startsWith("Sem a linha agora"))!, label: `Variação ${n}`,
      instrumentLabels: [...big.paths[0]!.instrumentLabels.filter((x) => x !== "Debênture da 2ª emissão, R$ 80 mi"), `Debênture adicional ${n}`]})));
    expect(complete(big).facts.instruments.length).toBe(16);
    const events: string[] = [];
    const turn = await proposeFinancingPathsPremisesForTurn({message: turn1, hasAttachments: false, recentUserMessages: [], projectId: project, asOf, loadEvidence: async () => [],
      extract: async () => big, log: (event) => {events.push(event);}});
    expect(turn).toEqual({forAdvisor: {status: "missing", missing: ["tooManyItems"]}, proposal: null});
    expect(events).toEqual(["financing_paths_premises.expansion_refused"]);
  });
  it("proposes only when the extraction reads the turn as answering", async () => {
    const e = vaultOnly(auroraExtraction(support.auroraCapitalPathsKernel()));
    for (const intent of nonAnswering)
      expect(await turnWithIntent((input) => proposeFinancingPathsPremisesForTurn({...input, asOf}), e, intent, turn2, [turn1]), intent)
        .toEqual({extracted: true, status: null, events: ["financing_paths_premises.not_answering"]});
    expect((await turnWithIntent((input) => proposeFinancingPathsPremisesForTurn({...input, asOf}), e, "answers_pending", turn1, [])).status).toBe("missing");
  });
});
