import {beforeAll, describe, expect, it} from "vitest";
import {createHash} from "node:crypto";
import {composeBoundReceivablesFunding, prepareReceivablesFundingPacket, proposeReceivablesFundingHypotheses, type ReceivablesFundingFacts} from "@offroad/financial-model";
import {receivablesFundingContradictions, buildReceivablesFundingPremiseProposal, completeReceivablesFundingFacts, proposeReceivablesFundingPremisesForTurn, receivablesFundingReader, receivablesFundingReaderGaps, shouldProposeReceivablesFundingPremises,
  type ReceivablesFundingExtraction} from "./receivables-funding-premises-proposal";
import {documentKey, itemKeys, stableKey} from "./lote2-premises";
import {readerGaps} from "./lote3-reader-check";
import {comparableHypotheses, financialModelFixture, nonAnswering, summaryGroups, summaryOrigins, turnWithIntent} from "./lote2-premises.test-support";

let aurora: () => ReceivablesFundingFacts;
beforeAll(async () => {aurora = (await financialModelFixture<{auroraReceivablesFundingFacts: () => ReceivablesFundingFacts}>("receivables-funding.test-support.ts")).auroraReceivablesFundingFacts;});
const none = {value: null, origin: null, source: null};
const said = (o: string) => o === "document" ? "document" as const : "informed" as const;
const sourcedOf = <T>(f: {value: T; origin: string; source: string} | null) => f === null ? none : {value: f.value, origin: said(f.origin), source: f.source};

/** The turn of ficha C35 as the extraction would read it from the portfolio, the contracts, the debt table and the options' terms. */
function auroraExtraction(f: ReceivablesFundingFacts): ReceivablesFundingExtraction {
  const label = (id: string) => f.items.find((i) => i.value.id === id)!.value.label;
  return {turnIntent: "answers_pending", referenceDate: {value: f.referenceDate, origin: "document", source: "posição da carteira"},
    needAverage: sourcedOf(f.needAverage), needPeak: sourcedOf(f.needPeak), needStartDate: sourcedOf(f.needStartDate), needEndDate: {value: f.endDate, origin: "informed", source: "fim da safra"}, useEndDate: none,
    calendarDays: sourcedOf(f.calendarDays), businessDays: sourcedOf(f.businessDays), needProfile: sourcedOf(f.needProfile), annualDi: sourcedOf(f.annualDi),
    averageTermDays: sourcedOf(f.averageTermDays), lienBasketRemaining: sourcedOf(f.lienBasketRemaining),
    dedicatedVehicleThreshold: {value: f.dedicatedVehicleThreshold.value, origin: "informed", source: "faixa informada pela tesouraria"},
    items: f.items.map((i) => {const v = i.value; return {label: v.label, origin: said(i.origin), source: i.source, amount: v.amount, contract: v.contract, encumbrance: v.encumbrance,
      encumbranceHolder: v.encumbranceHolder, releaseEvent: v.releaseEvent, originDate: v.originDate, dueDate: v.dueDate, registration: v.registration, creditTier: v.creditTier,
      anchorProgram: v.anchorProgram, debtorCount: v.debtorCount, largestDebtorAmount: v.largestDebtorAmount,
      debtorLabel: v.debtorCount === 1 ? v.label : null, debtorTaxId: null, debtorSetDisjoint: v.debtorSetDisjoint, anchor: null};}),
    options: f.options.map((o) => {const v = o.value, el = v.eligibility; return {label: v.label, origin: said(o.origin), source: o.source, provider: null, anchor: null, kind: v.kind, recourse: v.recourse,
      rateBasis: v.rate.basis, rate: v.rate.rate, iofDaily: v.iofDaily, iofDailyCapDays: v.iofDailyCapDays, iofAdditional: v.iofAdditional, rolloverDays: v.rolloverDays ?? "none",
      upfrontFee: v.upfrontFee, collateral: v.collateral, leadDaysMin: v.leadDaysMin, leadDaysMax: v.leadDaysMax, maxDaysPastDue: el?.maxDaysPastDue ?? null,
      maxRemainingTermDays: el?.maxRemainingTermDays ?? null, registrationRule: el?.registrationRule ?? null, minCreditTier: el?.minCreditTier ?? null,
      sublimitPerDebtor: el ? el.sublimitPerDebtor ?? "none" : null, sublimitGroup: el ? el.sublimitGroup ?? "none" : null, anchorItemLabels: (el?.anchorItemIds ?? []).map(label)};}),
  };
}
const idsOf = (f: ReceivablesFundingFacts) => ({receivablesFundingId: f.receivablesFundingId, entityId: f.entityId, definitionVersionId: f.definitionVersionId});
const renameOf = (f: ReceivablesFundingFacts) => {
  const pairs: [string, string][] = [];
  const add = (items: {label: string; id: string}[]) => itemKeys(items.map((x) => x.label)).forEach((k, n) => pairs.push([k, items[n]!.id]));
  add(f.items.map((i) => i.value)); add(f.options.map((o) => o.value));
  // Debtor keys identify the whole name; the fixture keys each debtor by its group id.
  const ids = itemKeys(f.items.map((i) => i.value.label));
  // A single debtor keys by its name; a set of debtors by its own record (source and position, no anchor in the fixture).
  f.items.forEach((i, k) => pairs.push([i.value.debtorCount === 1 ? stableKey(i.value.label, 80) : documentKey("conjunto", [i.source, null, ids[k]!]), i.value.debtorKey]));
  for (const o of f.options) if (o.value.eligibility?.sublimitGroup) pairs.push([stableKey(o.value.eligibility.sublimitGroup), o.value.eligibility.sublimitGroup]);
  return new Map(pairs);
};
const complete = (e: ReceivablesFundingExtraction, f: ReceivablesFundingFacts) => {
  const c = completeReceivablesFundingFacts({extraction: e, ids: idsOf(f), currency: "BRL"});
  if (c.status !== "complete") throw new Error(JSON.stringify(c));
  return c;
};

describe("receivables funding premises proposed from a turn", () => {
  it("recognizes the ficha C35 questions, with or without documents, and not a conceptual question or another method", () => {
    for (const m of ["Tenho uns 60 milhões de recebíveis. Dá para usar isso para financiar a safra em vez da linha do banco?", "Quero antecipar recebíveis em vez de pegar linha no banco.",
      "Quais FIDCs comprariam nossa carteira?", "Vale fazer um FIDC próprio?"]) for (const docs of [false, true]) expect(shouldProposeReceivablesFundingPremises(m, docs), m).toBe(true);
    for (const m of ["O que é um FIDC?", "Compare as propostas de antecipação de recebíveis.", "Quando é a semana mais apertada?"])
      for (const docs of [false, true]) expect(shouldProposeReceivablesFundingPremises(m, docs), m).toBe(false);
  });
  it("takes the treasurer's answer about the anchor program as a continuation candidate", () => {
    const earlier = ["Tenho uns 60 milhões de recebíveis. Dá para usar isso para financiar a safra em vez da linha do banco?"];
    expect(shouldProposeReceivablesFundingPremises("A rede A tem programa com o Santander. Nunca usamos.", false, earlier)).toBe(true);
    expect(shouldProposeReceivablesFundingPremises("A rede A tem programa?", false, earlier)).toBe(false);
  });
  it("completes the Aurora facts and proposes the hypotheses the fixture proposes", () => {
    const f = aurora(), c = complete(auroraExtraction(f), f);
    expect(c.situationId).toBe("seasonal-working-capital");
    expect(c.housePremiseKeys).toEqual([]);
    expect(comparableHypotheses(proposeReceivablesFundingHypotheses(c.facts), renameOf(f))).toEqual(comparableHypotheses(proposeReceivablesFundingHypotheses(f)));
  });
  it("names every house convention it uses and never adopts a value the source does not state", () => {
    const f = aurora(), e = auroraExtraction(f);
    e.calendarDays = none; e.businessDays = none;
    const c = complete(e, f);
    expect(c.facts.calendarDays).toMatchObject({value: 166, origin: "house"});
    expect(c.facts.businessDays.origin).toBe("estimate");
    expect(c.housePremiseKeys.sort()).toEqual(["businessDays", "calendarDays"]);
    const line = auroraExtraction(f); line.options.find((o) => o.kind === "bank_line")!.iofDaily = null; line.options[0]!.rate = null; line.annualDi = none; line.dedicatedVehicleThreshold = none;
    expect(completeReceivablesFundingFacts({extraction: line, ids: idsOf(f), currency: "BRL"})).toEqual({status: "missing", missing: ["annualDi", "dedicatedVehicleThreshold", "options.1.rate", "options.5.iofDaily"]});
  });
  it("asks for the IOF of a documented FIDC option instead of adopting zero under its document (independent review, round 2)", () => {
    const f = aurora(), e = auroraExtraction(f);
    const k = e.options.findIndex((o) => o.kind === "fidc");
    Object.assign(e.options[k]!, {origin: "document", source: "regulamento-fidc.pdf", iofDaily: null, iofDailyCapDays: null, iofAdditional: null});
    expect(completeReceivablesFundingFacts({extraction: e, ids: idsOf(f), currency: "BRL"})).toEqual({status: "missing",
      missing: [`options.${k + 1}.iofDaily`, `options.${k + 1}.iofDailyCapDays`, `options.${k + 1}.iofAdditional`]});
  });
  it("asks for debtor quality, anchor program, the disjoint debtor set and collateral instead of filling them under the source", () => {
    const f = aurora(), e = auroraExtraction(f);
    e.items[0]!.creditTier = null; e.items[0]!.anchorProgram = null;
    const multi = e.items.findIndex((i) => i.debtorCount !== 1); e.items[multi]!.debtorSetDisjoint = null;
    e.options[0]!.collateral = null;
    expect(completeReceivablesFundingFacts({extraction: e, ids: idsOf(f), currency: "BRL"})).toEqual({status: "missing",
      missing: ["items.1.creditTier", "items.1.anchorProgram", `items.${multi + 1}.debtorSetDisjoint`, "options.1.collateral"]});
  });
  it("asks for the contract, the encumbrance holder and an unknown anchor in one batch", () => {
    const f = aurora(), e = auroraExtraction(f);
    e.items[0]!.contract = null; e.items[1]!.encumbranceHolder = null; e.options[0]!.anchorItemLabels = ["Rede Z"];
    expect(completeReceivablesFundingFacts({extraction: e, ids: idsOf(f), currency: "BRL"})).toEqual({status: "missing",
      missing: ["items.1.contract", "items.2.encumbranceHolder", "options.1.anchorItemLabels"]});
  });
  it("never merges two debtors whose names share a long prefix, keys a CNPJ as itself and asks for a key that would join two identities (independent review, round 3)", () => {
    const f = aurora(), e = auroraExtraction(f);
    const base = e.items.find((i) => i.debtorCount === 1)!;
    const nordeste = "Distribuidora Brasileira de Alimentos Nordeste Ltda", sudeste = "Distribuidora Brasileira de Alimentos Sudeste Ltda";
    e.items = [{...base, label: nordeste, debtorLabel: nordeste, amount: "3000000"}, {...base, label: sudeste, debtorLabel: sudeste, amount: "3000000"}];
    e.options = e.options.filter((o) => o.kind !== "anchor_program");
    const c = complete(e, f), keys = c.facts.items.map((i) => i.value.debtorKey);
    expect(new Set(keys).size).toBe(2);
    // The same debtor named in two groups keeps one key; a stated CNPJ is the identity.
    const same = auroraExtraction(f); same.items = [{...base, label: "Lote 1", debtorLabel: "Rede Z"}, {...base, label: "Lote 2", debtorLabel: "Rede Z"}];
    same.options = same.options.filter((o) => o.kind !== "anchor_program");
    expect(new Set(complete(same, f).facts.items.map((i) => i.value.debtorKey)).size).toBe(1);
    const taxed = auroraExtraction(f); taxed.items = [{...base, label: "Rede Z", debtorLabel: "Rede Z", debtorTaxId: "12345678000190"}];
    taxed.options = taxed.options.filter((o) => o.kind !== "anchor_program");
    expect(complete(taxed, f).facts.items[0]!.value.debtorKey).toBe("cnpj-12345678000190");
    // Sublimit groups with long shared prefixes stay apart too.
    expect(stableKey("Fundos multicedentes do gestor Alfa Nordeste")).not.toBe(stableKey("Fundos multicedentes do gestor Alfa Sudeste"));
  });
  it("reconciles one debtor across groups when its CNPJ is stated in only one, through the packet (independent review, round 4)", () => {
    const f = aurora(), e = auroraExtraction(f);
    const base = {...e.items.find((i) => i.debtorCount === 1)!, amount: "3", contract: "assignable" as const, encumbrance: "free" as const, encumbranceHolder: null, releaseEvent: null,
      registration: "registered" as const, creditTier: "standard" as const, anchorProgram: "none" as const, debtorCount: 1, debtorSetDisjoint: null};
    e.items = [{...base, label: "Lote 1", debtorLabel: "Rede Z", debtorTaxId: "12345678000190"}, {...base, label: "Lote 2", debtorLabel: "Rede Z", debtorTaxId: null}];
    e.options = e.options.filter((o) => o.kind === "bank_line" || o.label === "FIDC multicedente com coobrigação");
    const c = complete(e, f);
    expect(c.facts.items.map((i) => i.value.debtorKey)).toEqual(["cnpj-12345678000190", "cnpj-12345678000190"]);
    // Adopted, composed and measured: one debtor, one sublimit of 3, never two.
    const fidcVolume = (facts: ReceivablesFundingFacts) => {
    const question = "Quero antecipar recebíveis em vez de pegar linha no banco.";
    const uuid = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const entries = proposeReceivablesFundingHypotheses(facts).map((h, n) => ({decisionId: uuid(9000 + n), slotKey: createHash("sha256").update(h.fieldPath + h.dimensions.scenario).digest("hex"),
      kind: "hypothesis", fieldPath: h.fieldPath, dimensions: {...h.dimensions}, value: h.value, observationId: null, referenceValue: null, referenceDimensions: null,
      definitionKind: "managerial", actorId: uuid(5), reason: h.reason}));
    const snapshot = {schemaVersion: "contextual-adoption.v1", versionId: uuid(500), setId: uuid(6), workId: uuid(7), purpose: "synthetic receivables funding", contextKey: "recebiveis-giro",
      revision: 1, previousVersionId: null, classification: "working_basis", entries};
    const canonical = JSON.stringify(snapshot);
    const packet = prepareReceivablesFundingPacket(composeBoundReceivablesFunding({envelope: {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")},
      scope: {workId: uuid(7), purpose: snapshot.purpose, versionId: uuid(500)}, question}));
    return Number(packet.result.funding!.options.find((o) => o.kind === "fidc")!.volume);
    };
    expect(fidcVolume(c.facts)).toBe(3);
    // Two distinct debtors would take two sublimits: the reconciliation is what keeps it at one.
    const two = auroraExtraction(f); two.items = [e.items[0]!, {...e.items[1]!, debtorLabel: "Rede Y"}]; two.options = e.options;
    expect(fidcVolume(complete(two, f).facts)).toBe(6);
  });
  it("asks when one name carries two CNPJs or one CNPJ carries two names, never splitting nor merging", () => {
    const f = aurora(), e = auroraExtraction(f);
    const base = {...e.items.find((i) => i.debtorCount === 1)!};
    e.items = [{...base, label: "Lote 1", debtorLabel: "Rede Z", debtorTaxId: "12345678000190"}, {...base, label: "Lote 2", debtorLabel: "Rede Z", debtorTaxId: "98765432000110"}];
    expect(completeReceivablesFundingFacts({extraction: e, ids: idsOf(f), currency: "BRL"})).toMatchObject({status: "missing", missing: expect.arrayContaining(["items.1.debtorTaxId", "items.2.debtorTaxId"])});
    e.items = [{...base, label: "Lote 1", debtorLabel: "Rede Z", debtorTaxId: "12345678000190"}, {...base, label: "Lote 2", debtorLabel: "Rede W", debtorTaxId: "12345678000190"}];
    expect(completeReceivablesFundingFacts({extraction: e, ids: idsOf(f), currency: "BRL"})).toMatchObject({status: "missing", missing: expect.arrayContaining(["items.1.debtorLabel", "items.2.debtorLabel"])});
  });
  it("builds the card summary, field paths the store accepts and a stable fingerprint", () => {
    const f = aurora(), c = complete(auroraExtraction(f), f), proposal = buildReceivablesFundingPremiseProposal(c.facts);
    expect(proposal.summary).toMatchObject({situationId: "seasonal-working-capital", referenceDate: "2026-09-15"});
    expect(proposal.summary.items.every((x) => summaryGroups.includes(x.group) && summaryOrigins.includes(x.origin))).toBe(true);
    expect(proposal.summary.items.filter((x) => x.group === "premise").map((x) => [x.labelKey, x.origin])).toEqual([["needAverage", "informed"], ["needPeak", "informed"],
      ["annualDi", "informed"], ["lienBasketRemaining", "document"], ["dedicatedVehicleThreshold", "informed"]]);
    expect(proposal.hypotheses.every((h) => /^receivables_funding\.[0-9a-f-]{36}\.[A-Za-z0-9_.-]{1,200}$/.test(h.fieldPath))).toBe(true);
    expect(proposal).toMatchObject({methodId: "monetize-receivables-for-working-capital", methodVersion: "2026.10.26-v1"});
  });
  it("names the basis limit as a gap in the turn instead of dropping the card: 16 groups and 5 options (independent review, round 8)", async () => {
    const e = auroraExtraction(aurora());
    e.items = Array.from({length: 16}, (_, k) => ({...e.items[k % e.items.length]!, label: k < e.items.length ? e.items[k]!.label : `Grupo ${k + 1}`}));
    e.options = Array.from({length: 5}, (_, k) => ({...e.options[k % e.options.length]!, label: k < e.options.length ? e.options[k]!.label : `Opção ${k + 1}`}));
    expect(completeReceivablesFundingFacts({extraction: e, ids: idsOf(aurora()), currency: "BRL"})).toMatchObject({status: "complete"});
    const events: string[] = [];
    const turn = await proposeReceivablesFundingPremisesForTurn({message: "Quero antecipar recebíveis em vez de pegar linha no banco.", hasAttachments: false, recentUserMessages: [],
      projectId: "a0000000-0000-4000-8000-000000000001", loadEvidence: async () => [], extract: async () => e, log: (event) => {events.push(event);}});
    expect(turn).toEqual({forAdvisor: {status: "missing", missing: ["tooManyItems"]}, proposal: null});
    expect(events).toEqual(["receivables_funding_premises.expansion_refused"]);
  });
  it("never turns absence into zero: an unstated rollover, sublimit or lien basket is asked; unknown lead time and concentration stay unknown (independent review, round 9)", () => {
    const f = aurora(), e = auroraExtraction(f);
    const fidc = e.options.findIndex((o) => o.kind !== "bank_line"), line = e.options.findIndex((o) => o.collateral !== "none");
    e.options[fidc] = {...e.options[fidc]!, rolloverDays: null, sublimitPerDebtor: null};
    const asked = completeReceivablesFundingFacts({extraction: {...e, lienBasketRemaining: none}, ids: idsOf(f), currency: "BRL"});
    expect(asked.status === "missing" ? [...asked.missing].sort() : asked).toEqual([`options.${fidc + 1}.rolloverDays`, `options.${fidc + 1}.sublimitPerDebtor`, ...line >= 0 ? ["lienBasketRemaining"] : []].sort());
    // Stated as none, they are none; lead time, debtor count, largest debtor and release event absent are carried as
    // unknown (null in the packet, the sublimit test unverified), never as zero.
    const stated = auroraExtraction(f);
    stated.options = stated.options.map((o) => ({...o, leadDaysMin: null, leadDaysMax: null}));
    stated.items = stated.items.map((i) => ({...i, largestDebtorAmount: null}));
    const c = completeReceivablesFundingFacts({extraction: stated, ids: idsOf(f), currency: "BRL"});
    expect(c.status).toBe("complete");
    let packet: {status: string; result: unknown} | undefined;
    expect(readerGaps(proposeReceivablesFundingHypotheses(c.status === "complete" ? c.facts : (null as never)), (b) => {packet = receivablesFundingReader(b) as never;})).toEqual([]);
    const text = JSON.stringify(packet!.result);
    expect(text.includes("\"leadDays\":null")).toBe(true);
    expect(text.includes("\"leadDays\":{\"min\":0")).toBe(false);
  });
  it("asks whether two sale options capped per debtor share their buyers, never assuming independence (independent review, round 10)", () => {
    const f = aurora(), e = auroraExtraction(f), fidc = e.options.find((o) => o.kind === "fidc")!;
    const two = (group1: string | null, group2: string | null) => ({...e, options: [...e.options.filter((o) => o.kind !== "fidc"),
      {...fidc, label: "FIDC produto A", sublimitPerDebtor: "3", sublimitGroup: group1}, {...fidc, label: "FIDC produto B", sublimitPerDebtor: "3", sublimitGroup: group2}]});
    const n = e.options.filter((o) => o.kind !== "fidc").length;
    const asked = completeReceivablesFundingFacts({extraction: two(null, null), ids: idsOf(f), currency: "BRL"});
    expect(asked.status === "missing" ? asked.missing.filter((m) => m.endsWith("sublimitGroup")) : asked).toEqual([`options.${n + 1}.sublimitGroup`, `options.${n + 2}.sublimitGroup`]);
    // Stated either way, the card is offered, and the packet reads the stated grouping.
    const packetOf = (g1: string, g2: string) => {
      const c = completeReceivablesFundingFacts({extraction: two(g1, g2), ids: idsOf(f), currency: "BRL"});
      if (c.status !== "complete") throw new Error(JSON.stringify(c));
      let packet: {result: unknown} | undefined;
      expect(readerGaps(proposeReceivablesFundingHypotheses(c.facts), (b) => {packet = receivablesFundingReader(b) as never;})).toEqual([]);
      return JSON.stringify(packet!.result);
    };
    expect(packetOf("none", "none")).not.toBe(packetOf("Cotistas do FIDC", "Cotistas do FIDC"));
  });
  it("asks a value stated without origin and business days beyond the calendar days (independent review, round 11)", () => {
    const f = aurora(), e = auroraExtraction(f);
    const unsourced = completeReceivablesFundingFacts({extraction: {...e, lienBasketRemaining: {value: "3", origin: null, source: null}}, ids: idsOf(f), currency: "BRL"});
    expect(unsourced.status === "missing" && unsourced.missing.includes("lienBasketRemaining")).toBe(true);
    const days = completeReceivablesFundingFacts({extraction: {...e, businessDays: {value: 400, origin: "informed", source: "tesouraria"}}, ids: idsOf(f), currency: "BRL"});
    expect(days.status === "missing" && days.missing.includes("businessDays")).toBe(true);
  });
  it("asks every contradiction inside one record, never resolving it in favour of availability (independent review, round 12)", () => {
    const f = aurora();
    expect(receivablesFundingContradictions(auroraExtraction(f))).toEqual([]);
    const cases: [string, (e: ReceivablesFundingExtraction) => void][] = [
      ["items.1.encumbrance", (e) => {e.items[0] = {...e.items[0]!, encumbrance: "free", encumbranceHolder: "Banco Alfa", releaseEvent: "quitação da CCB"};}],
      ["items.1.dueDate", (e) => {e.items[0] = {...e.items[0]!, originDate: "2026-09-10", dueDate: "2026-09-01"};}],
      ["items.1.originDate", (e) => {e.items[0] = {...e.items[0]!, originDate: "2027-01-01", dueDate: "2027-02-01"};}],
      ["items.1.debtorSetDisjoint", (e) => {e.items[0] = {...e.items[0]!, debtorCount: 1, debtorSetDisjoint: true};}],
      ["items.1.largestDebtorAmount", (e) => {e.items[0] = {...e.items[0]!, largestDebtorAmount: String(Number(e.items[0]!.amount) + 1)};}],
      ["needPeak", (e) => {e.needPeak = {...e.needPeak, value: "1"}; e.needAverage = {...e.needAverage, value: "2"};}],
      ["needEndDate", (e) => {e.needEndDate = {...e.needEndDate, value: e.needStartDate.value};}],
      ["dedicatedVehicleThreshold", (e) => {e.dedicatedVehicleThreshold = {...e.dedicatedVehicleThreshold, value: {min: "5", max: "3"}};}],
      [`options.${5}.recourse`, (e) => {e.options[4] = {...e.options[4]!, recourse: "without_recourse"};}],
      [`options.${5}.kind`, (e) => {e.options[4] = {...e.options[4]!, maxDaysPastDue: 0};}],
      [`options.${2}.anchorItemLabels`, (e) => {e.options[1] = {...e.options[1]!, anchorItemLabels: [e.items[0]!.label]};}],
      [`options.${4}.sublimitGroup`, (e) => {e.options[3] = {...e.options[3]!, sublimitPerDebtor: "none", sublimitGroup: "Cotistas"};}],
      [`options.${2}.leadDays`, (e) => {e.options[1] = {...e.options[1]!, leadDaysMin: 30, leadDaysMax: 15};}],
    ];
    expect(auroraExtraction(f).options[4]!.kind).toBe("bank_line");
    for (const [key, edit] of cases) {
      const e = auroraExtraction(f); edit(e);
      expect(receivablesFundingContradictions(e), key).toEqual([key]);
      const c = completeReceivablesFundingFacts({extraction: e, ids: idsOf(f), currency: "BRL"});
      expect(c.status === "missing" && c.missing.includes(key), key).toBe(true);
    }
  });
  it("never refuses a coherent boundary: each contradiction rule passes its equal or single case (independent review, round 13)", () => {
    const f = aurora();
    const cases: [string, (e: ReceivablesFundingExtraction) => void][] = [
      ["peak equal to average", (e) => {e.needPeak = {...e.needPeak, value: e.needAverage.value};}],
      ["due on the origin date", (e) => {e.items[0] = {...e.items[0]!, dueDate: e.items[0]!.originDate};}],
      ["origin on the reference date", (e) => {e.items[0] = {...e.items[0]!, originDate: e.referenceDate.value};}],
      ["single debtor with largest equal to the lot", (e) => {const i = e.items.findIndex((x) => x.debtorCount === 1); e.items[i] = {...e.items[i]!, largestDebtorAmount: e.items[i]!.amount};}],
      ["largest times count equal to the lot", (e) => {const i = e.items.findIndex((x) => x.debtorCount === 2); e.items[i] = {...e.items[i]!, largestDebtorAmount: String(Number(e.items[i]!.amount) / 2)};}],
      ["vehicle band of one value", (e) => {e.dedicatedVehicleThreshold = {...e.dedicatedVehicleThreshold, value: {min: "4", max: "4.0000"}};}],
      ["lead days of one value", (e) => {e.options[1] = {...e.options[1]!, leadDaysMin: 20, leadDaysMax: 20};}],
      ["business days equal to calendar days", (e) => {e.businessDays = {...e.businessDays, value: e.calendarDays.value};}],
      ["end of use consistent with the length", (e) => {e.useEndDate = {value: "2027-04-14", origin: "informed", source: "tesouraria"};}],
    ];
    for (const [name, edit] of cases) {
      const e = auroraExtraction(f); edit(e);
      expect(receivablesFundingContradictions(e), name).toEqual([]);
      const c = completeReceivablesFundingFacts({extraction: e, ids: idsOf(f), currency: "BRL"});
      expect(c.status, name).toBe("complete");
      expect(receivablesFundingReaderGaps(c.status === "complete" ? c.facts : (null as never)), name).toEqual([]);
    }
  });
  it("compares the period of use with like: start, end of use and length; the end of the need is another fact (independent review, round 13)", () => {
    const f = aurora(), e = auroraExtraction(f);
    // The reviewer's case: start 16/10/2026, end of use 31/03/2027 and 30 calendar days disagree, so the length is asked.
    e.needStartDate = {...e.needStartDate, value: "2026-10-16"}; e.useEndDate = {value: "2027-03-31", origin: "informed", source: "tesouraria"}; e.calendarDays = {...e.calendarDays, value: 30};
    expect(receivablesFundingContradictions(e)).toEqual(["calendarDays"]);
    // Two of the three derive the third: no stated length, the 166 days between the dates are the period of use.
    const derived = completeReceivablesFundingFacts({extraction: {...e, calendarDays: none, businessDays: none}, ids: idsOf(f), currency: "BRL"});
    expect(derived.status === "complete" ? derived.facts.calendarDays.value : derived).toBe(166);
    // The calibration states the end of the need (31/03/2027) and 180 days of use: different facts, both kept.
    expect(receivablesFundingContradictions(auroraExtraction(f))).toEqual([]);
  });
  it("record identity of lots: a lot is identified by its anchor; equal lots that no anchor tells apart are asked (independent review, rounds 14 and 15)", () => {
    const f = aurora(), e = auroraExtraction(f), lot = {...e.items[0]!, label: "Lote Rede X", amount: "6", source: "borderô 101", anchor: null};
    const n = e.items.length;
    // Two borderôs, no anchor: asked.
    const two = completeReceivablesFundingFacts({extraction: {...e, items: [...e.items, lot, {...lot, source: "borderô 102"}]}, ids: idsOf(f), currency: "BRL"});
    expect(two.status === "missing" ? two.missing : two).toEqual([`items.${n + 2}.duplicateOf`]);
    // One borderô, two rows without anchors: asked as well (the same source does not identify a row).
    const rows = completeReceivablesFundingFacts({extraction: {...e, items: [...e.items, lot, {...lot}]}, ids: idsOf(f), currency: "BRL"});
    expect(rows.status === "missing" ? rows.missing : rows).toEqual([`items.${n + 2}.duplicateOf`]);
    // Two rows of one borderô with their anchors: two lots, R$ 12 million, no gap.
    const anchored = completeReceivablesFundingFacts({extraction: {...e, items: [...e.items, {...lot, anchor: "linha 3"}, {...lot, anchor: "linha 4"}]}, ids: idsOf(f), currency: "BRL"});
    expect(anchored.status === "complete" ? anchored.facts.items.length : anchored).toBe(n + 2);
    // The same row read twice: merged.
    const once = completeReceivablesFundingFacts({extraction: {...e, items: [...e.items, {...lot, anchor: "linha 3"}, {...lot, anchor: "linha 3"}]}, ids: idsOf(f), currency: "BRL"});
    expect(once.status === "complete" ? once.facts.items.length : once).toBe(n + 1);
    // Labels are stated text: "001" and "1" are two lots.
    const labels = completeReceivablesFundingFacts({extraction: {...e, items: [...e.items, {...lot, label: "001"}, {...lot, label: "1"}]}, ids: idsOf(f), currency: "BRL"});
    expect(labels.status === "complete" ? labels.facts.items.slice(-2).map((i) => i.value.label) : labels).toEqual(["001", "1"]);
  });
  it("a stated anchor is the lot's identity: the same row read with two values is asked, never summed (independent review, round 16)", () => {
    const f = aurora(), e = auroraExtraction(f), n = e.items.length, lot = {...e.items[0]!, label: "Lote Rede X", amount: "6", source: "borderô 101", anchor: "linha 3"};
    const c = completeReceivablesFundingFacts({extraction: {...e, items: [...e.items, lot, {...lot, amount: "7"}]}, ids: idsOf(f), currency: "BRL"});
    expect(c.status === "missing" ? c.missing : c).toEqual([`items.${n + 2}.anchor`]);
    // The same anchor in another borderô is another row.
    const other = completeReceivablesFundingFacts({extraction: {...e, items: [...e.items, lot, {...lot, amount: "7", source: "borderô 102"}]}, ids: idsOf(f), currency: "BRL"});
    expect(other.status === "complete" ? other.facts.items.length : other).toBe(n + 2);
  });
  it("option identity: provider and label; one offer read with two rates is asked, two funds with equal terms are two (independent review, round 17)", () => {
    const f = aurora(), e = auroraExtraction(f), n = e.options.length, fidc = e.options.find((o) => o.kind === "fidc")!;
    const offer = {...fidc, label: "FIDC Alfa", source: "proposta de 10/10", sublimitGroup: "none" as const};
    const run = (options: ReceivablesFundingExtraction["options"]) => completeReceivablesFundingFacts({extraction: {...e, options: [...e.options, ...options]}, ids: idsOf(f), currency: "BRL"});
    // The same offer of one provider read with two rates: asked, never two options.
    const rates = run([{...offer, provider: "Gestora Alfa"}, {...offer, provider: "Gestora Alfa", rate: "0.021", source: "e-mail do gestor"}]);
    expect(rates.status === "missing" ? rates.missing : rates).toEqual([`options.${n + 2}.terms`]);
    // Without a provider, the same label from another source is asked.
    const unnamed = run([{...offer, provider: null}, {...offer, provider: null, rate: "0.021", source: "e-mail do gestor"}]);
    expect(unnamed.status === "missing" ? unnamed.missing : unnamed).toEqual([`options.${n + 2}.duplicateOf`]);
    // Two funds with the same label and terms, from two providers: two options.
    const funds = run([{...offer, provider: "Gestora Alfa"}, {...offer, provider: "Gestora Beta"}]);
    expect(funds.status === "complete" ? funds.facts.options.length : funds).toBe(n + 2);
    // The same reading twice (same provider, label and terms; or same source and anchor without provider): one option.
    expect((run([{...offer, provider: "Gestora Alfa"}, {...offer, provider: "Gestora Alfa", source: "cópia"}]) as {facts?: {options: unknown[]}}).facts?.options.length).toBe(n + 1);
    expect((run([{...offer, provider: null, anchor: "p. 2"}, {...offer, provider: null, anchor: "p. 2"}]) as {facts?: {options: unknown[]}}).facts?.options.length).toBe(n + 1);
    // Same source and anchor, other terms, no provider: the same page read inconsistently, asked.
    const page = run([{...offer, provider: null, anchor: "p. 2"}, {...offer, provider: null, anchor: "p. 2", rate: "0.021"}]);
    expect(page.status === "missing" ? page.missing : page).toEqual([`options.${n + 2}.anchor`]);
  });
  it("origin is provenance, not identity: the same row told and read is one lot; told with another value is asked (independent review, round 18)", () => {
    const f = aurora(), e = auroraExtraction(f), n = e.items.length, lot = {...e.items[0]!, label: "Lote Rede X", amount: "6", source: "borderô 101", anchor: "linha 3"};
    const one = completeReceivablesFundingFacts({extraction: {...e, items: [...e.items, {...lot, origin: "document" as const}, {...lot, origin: "informed" as const}]}, ids: idsOf(f), currency: "BRL"});
    expect(one.status === "complete" ? [one.facts.items.length, one.facts.items[n]!.origin, one.facts.items[n]!.source.includes("também informado na conversa")] : one)
      .toEqual([n + 1, "document", true]);
    const two = completeReceivablesFundingFacts({extraction: {...e, items: [...e.items, {...lot, origin: "document" as const}, {...lot, origin: "informed" as const, amount: "7"}]}, ids: idsOf(f), currency: "BRL"});
    expect(two.status === "missing" ? two.missing : two).toEqual([`items.${n + 2}.anchor`]);
  });
  it("three readings of one lot are one lot; a third reading with another value is asked (independent review, round 19)", () => {
    const f = aurora(), e = auroraExtraction(f), n = e.items.length, lot = {...e.items[0]!, label: "Lote Rede X", amount: "6", source: "borderô 101", anchor: "linha 3"};
    const reading = (origin: "document" | "informed", amount = "6") => ({...lot, origin, amount});
    const three = completeReceivablesFundingFacts({extraction: {...e, items: [...e.items, reading("document"), reading("informed"), reading("document")]}, ids: idsOf(f), currency: "BRL"});
    expect(three.status === "complete" ? three.facts.items.length : three).toBe(n + 1);
    const odd = completeReceivablesFundingFacts({extraction: {...e, items: [...e.items, reading("document"), reading("informed"), reading("document", "7")]}, ids: idsOf(f), currency: "BRL"});
    expect(odd.status === "missing" ? odd.missing : odd).toEqual([`items.${n + 2}.anchor`]);
  });
  it("a group of several debtors is a set identified by its own record, never by its descriptive label (independent review, round 21)", () => {
    const f = aurora(), e = auroraExtraction(f);
    const varejo = {...e.items.find((i) => (i.debtorCount ?? 0) > 1)!, label: "Varejo", amount: "6", debtorCount: 2, largestDebtorAmount: null, debtorLabel: null, debtorTaxId: null,
      source: "borderô 101", encumbrance: "free" as const, encumbranceHolder: null, releaseEvent: null, contract: "assignable" as const};
    const groups = (disjoint: boolean | null) => [{...varejo, anchor: "linha 3", debtorSetDisjoint: disjoint}, {...varejo, anchor: "linha 4", debtorSetDisjoint: disjoint}];
    const options = e.options.filter((o) => o.kind !== "anchor_program");
    const c = completeReceivablesFundingFacts({extraction: {...e, items: groups(true), options}, ids: idsOf(f), currency: "BRL"});
    if (c.status !== "complete") throw new Error(JSON.stringify(c));
    expect(new Set(c.facts.items.map((i) => i.value.debtorKey)).size).toBe(2);
    // The card is proposed: the method's own reader and packet accept the two independent sets.
    let packet: {readings: {portfolio?: {assignable: string}; assignable?: string} | null} | undefined;
    expect(readerGaps(proposeReceivablesFundingHypotheses(c.facts), (b) => {packet = receivablesFundingReader(b) as never;})).toEqual([]);
    expect(JSON.stringify(packet!.readings)).toContain('"assignable":"12"');
    // Without the disjoint declaration, whether the two sets share debtors is asked.
    const unstated = completeReceivablesFundingFacts({extraction: {...e, items: groups(null), options}, ids: idsOf(f), currency: "BRL"});
    expect(unstated.status === "missing" ? unstated.missing : unstated).toEqual(["items.1.debtorSetDisjoint", "items.2.debtorSetDisjoint"]);
  });
  it("two sets at 'Clientes-A'!A2 and 'Clientes A'!A2 are two sets: card proposed with 12 assignable (independent review, round 22)", () => {
    const f = aurora(), e = auroraExtraction(f);
    const varejo = {...e.items.find((i) => (i.debtorCount ?? 0) > 1)!, label: "Varejo", amount: "6", debtorCount: 2, largestDebtorAmount: null, debtorLabel: null, debtorTaxId: null,
      source: "carteira.xlsx", encumbrance: "free" as const, encumbranceHolder: null, releaseEvent: null, contract: "assignable" as const, debtorSetDisjoint: true};
    const c = completeReceivablesFundingFacts({extraction: {...e, items: [{...varejo, anchor: "'Clientes-A'!A2"}, {...varejo, anchor: "'Clientes A'!A2"}],
      options: e.options.filter((o) => o.kind !== "anchor_program")}, ids: idsOf(f), currency: "BRL"});
    if (c.status !== "complete") throw new Error(JSON.stringify(c));
    expect(new Set(c.facts.items.map((i) => i.value.debtorKey)).size).toBe(2);
    let packet: {readings: unknown} | undefined;
    expect(readerGaps(proposeReceivablesFundingHypotheses(c.facts), (b) => {packet = receivablesFundingReader(b) as never;})).toEqual([]);
    expect(JSON.stringify(packet!.readings)).toContain('"assignable":"12"');
  });
  it("a stated CNPJ alone identifies the debtor; names conflict only when stated (independent review, round 16)", () => {
    const f = aurora(), e = auroraExtraction(f), base = e.items.find((i) => i.debtorCount === 1)!;
    const lots = (a: string | null, b: string | null) => ({...e, items: [{...base, label: "Lote de outubro", debtorLabel: a, debtorTaxId: "12345678000190"},
      {...base, label: "Lote de novembro", debtorLabel: b, debtorTaxId: "12345678000190"}], options: e.options.filter((o) => o.kind !== "anchor_program")});
    const unnamed = completeReceivablesFundingFacts({extraction: lots(null, null), ids: idsOf(f), currency: "BRL"});
    expect(unnamed.status === "complete" ? unnamed.facts.items.map((i) => i.value.debtorKey) : unnamed).toEqual(["cnpj-12345678000190", "cnpj-12345678000190"]);
    const oneNamed = completeReceivablesFundingFacts({extraction: lots("Rede Z", null), ids: idsOf(f), currency: "BRL"});
    expect(oneNamed.status).toBe("complete");
    const twoNames = completeReceivablesFundingFacts({extraction: lots("Rede Z", "Rede W"), ids: idsOf(f), currency: "BRL"});
    expect(twoNames.status === "missing" ? twoNames.missing : twoNames).toEqual(["items.1.debtorLabel", "items.2.debtorLabel"]);
  });
  it("never reads a lot label as the debtor where a per-debtor sublimit applies, and keeps Unicode names apart (independent review, round 15)", () => {
    const f = aurora(), e = auroraExtraction(f), single = e.items.findIndex((i) => i.debtorCount === 1);
    const unnamed = {...e, items: e.items.map((i, k) => k === single ? {...i, label: "Lote de outubro", debtorLabel: null} : i)};
    const c = completeReceivablesFundingFacts({extraction: unnamed, ids: idsOf(f), currency: "BRL"});
    expect(c.status === "missing" ? c.missing : c).toEqual([`items.${single + 1}.debtorLabel`]);
    // Names in other scripts and accents keep their identity: two Chinese names, an Arabic and accented names.
    const names = ["北京食品", "上海化工", "شركة الغذاء", "Açúcar Guaraní", "Acucar Guarani Ltda"];
    expect(new Set(names.map((x) => stableKey(x))).size).toBe(names.length);
    expect(stableKey("Açúcar Guaraní")).toBe(stableKey("ACUCAR GUARANI"));
    expect(names.every((x) => /^[a-z0-9][a-z0-9.-]{0,79}$/.test(stableKey(x, 80)))).toBe(true);
  });

  it("asks for an item label stated twice instead of anchoring an option to the first (independent review, round 8)", () => {
    const e = auroraExtraction(aurora()); e.items[1] = {...e.items[1]!, label: e.items[0]!.label.toUpperCase()};
    // Asked because an option names its lots by that label.
    e.options[0] = {...e.options[0]!, anchorItemLabels: [e.items[0]!.label]};
    const c = completeReceivablesFundingFacts({extraction: e, ids: idsOf(aurora()), currency: "BRL"});
    expect(c.status === "missing" && c.missing.includes("items.2.label")).toBe(true);
  });
  it("proposes only when the extraction reads the turn as answering", async () => {
    const earlier = ["Quero antecipar recebíveis em vez de pegar linha no banco."];
    for (const intent of nonAnswering)
      expect(await turnWithIntent(proposeReceivablesFundingPremisesForTurn, auroraExtraction(aurora()), intent, "Mando a carteira amanhã", earlier), intent)
        .toEqual({extracted: true, status: null, events: ["receivables_funding_premises.not_answering"]});
    expect(await turnWithIntent(proposeReceivablesFundingPremisesForTurn, auroraExtraction(aurora()), "answers_pending", earlier[0]!, [])).toMatchObject({status: "proposed"});
  });
});
