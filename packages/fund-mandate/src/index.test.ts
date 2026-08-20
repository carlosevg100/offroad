import {describe, expect, it} from "vitest";

import {assessMandateFit, rankFits, structuralExclusions, type DealRequest} from "./fit";
import {resolveMandate, type Mandate} from "./mandate";
import {monthsBetween, resolveCriterion, type Sourced} from "./provenance";

const ASOF = "2026-08-20";

const say = <T>(value: T, provenance: Sourced<T>["provenance"], observedAt: string, note?: string): Sourced<T> => ({
  value,
  provenance,
  observedAt,
  ...(note ? {note} : {}),
});

/** A mid-market Brazilian credit fund with a complete, current record. */
const completeMandate = (overrides: Partial<Mandate> = {}): Mandate => ({
  fundId: "f1",
  fundName: "Fundo Exemplo Crédito Estruturado",
  ticket: [say({min: "10000000", max: "60000000"}, "declared", "2026-07-01")],
  termMonths: [say({min: 24, max: 84}, "declared", "2026-07-01")],
  sectors: [say(["varejo", "alimentos", "logística"], "declared", "2026-07-01")],
  instruments: [say(["debenture", "ccb", "nota_comercial"] as const, "declared", "2026-07-01")],
  collateral: [say(["recebiveis", "imovel", "cessao_fiduciaria"] as const, "declared", "2026-07-01")],
  geographies: [say(["BR"], "declared", "2026-07-01")],
  leverageCeiling: [say("3.50", "declared", "2026-07-01")],
  minimumDscr: [say("1.30", "declared", "2026-07-01")],
  active: [say(true, "declared", "2026-07-01")],
  ...overrides,
});

const fullRequest: DealRequest = {
  amount: "45000000",
  termMonths: 60,
  sector: "varejo",
  geography: "BR",
  instruments: ["debenture"],
  collateral: ["recebiveis", "imovel"],
  leverage: "2.80",
  dscr: "1.45",
};

describe("provenance", () => {
  it("prefers what the fund declared over what we inferred", () => {
    const resolved = resolveCriterion(
      [say("inferred value", "inferred", "2026-08-01"), say("declared value", "declared", "2026-08-01")],
      {asOf: ASOF},
    )!;
    expect(resolved.value).toBe("declared value");
    // The loser is kept: a mandate record that discards our own reading loses the ability to
    // show a fund what we thought before they corrected us.
    expect(resolved.others).toHaveLength(1);
  });

  it("never lets behaviour silently override what the fund declared", () => {
    // Declared 18 months ago and never revisited; deals actually done two months ago disagree.
    // The declaration still stands. Telling a manager what their mandate "really" is, on the
    // strength of our own reading of their transactions, is how a first call goes badly.
    const resolved = resolveCriterion(
      [say("said long ago", "declared", "2025-02-01"), say("did recently", "observed", "2026-06-01")],
      {asOf: ASOF, statementDecayMonths: 12},
    )!;
    expect(resolved.value).toBe("said long ago");
    expect(resolved.divergent).toBe(true);
  });

  it("lets a fresher source overtake a stale one where nobody is being overruled", () => {
    // A call last month against a declaration from two years ago: same voice, newer.
    const conversation = resolveCriterion(
      [say("said in 2024", "declared", "2024-08-01"), say("said last month", "conversation", "2026-07-15")],
      {asOf: ASOF, statementDecayMonths: 12},
    )!;
    expect(conversation.value).toBe("said last month");

    // Behaviour against a stale fact sheet: the fact sheet was never a commitment.
    const published = resolveCriterion(
      [say("old fact sheet", "published", "2024-01-01"), say("did in 2026", "observed", "2026-05-01")],
      {asOf: ASOF, statementDecayMonths: 12},
    )!;
    expect(published.value).toBe("did in 2026");
  });

  it("keeps a stale declaration above our own guess", () => {
    // Decay is one rank, not a reordering.
    const resolved = resolveCriterion(
      [say("said long ago", "declared", "2025-02-01"), say("we guessed", "inferred", "2026-08-01")],
      {asOf: ASOF, statementDecayMonths: 12},
    )!;
    expect(resolved.value).toBe("said long ago");
  });

  it("does not age what a fund actually did", () => {
    // A transaction from 2024 is permanent evidence about 2024. Only statements go stale.
    const resolved = resolveCriterion(
      [say("did in 2024", "observed", "2024-03-01"), say("we guessed", "inferred", "2026-08-01")],
      {asOf: ASOF, statementDecayMonths: 12},
    )!;
    expect(resolved.value).toBe("did in 2024");
  });

  it("flags behaviour that contradicts the statement, and does not resolve it", () => {
    const resolved = resolveCriterion(
      [say(80, "declared", "2026-07-01"), say(12, "observed", "2026-06-01")],
      {asOf: ASOF},
      (accepted, other, tolerance) => Math.abs((other - accepted) / accepted) > tolerance,
    )!;
    // The declared value still wins — the platform does not overrule the fund.
    expect(resolved.value).toBe(80);
    // But the contradiction is on the record for a person to weigh.
    expect(resolved.divergent).toBe(true);
  });

  it("does not call two disagreeing statements a divergence", () => {
    // A stale website against a fresh declaration is an out-of-date page, not a finding about
    // how the fund behaves.
    const resolved = resolveCriterion(
      [say(80, "declared", "2026-07-01"), say(12, "published", "2024-01-01")],
      {asOf: ASOF},
      (accepted, other, tolerance) => Math.abs((other - accepted) / accepted) > tolerance,
    )!;
    expect(resolved.divergent).toBe(false);
  });

  it("is deterministic", () => {
    const observations = [
      say("a", "published", "2026-01-01"),
      say("b", "published", "2026-01-01"),
      say("c", "conversation", "2026-01-01"),
    ];
    const first = resolveCriterion(observations, {asOf: ASOF})!;
    const second = resolveCriterion([...observations].reverse(), {asOf: ASOF})!;
    expect(first.value).toBe(second.value);
  });

  it("returns nothing when nothing is known", () => {
    expect(resolveCriterion([], {asOf: ASOF})).toBeNull();
    expect(monthsBetween("not a date", ASOF)).toBe(0);
  });
});

describe("resolveMandate", () => {
  it("names every criterion where behaviour contradicts the statement", () => {
    const mandate = completeMandate({
      ticket: [
        say({min: "20000000", max: "80000000"}, "declared", "2026-07-01"),
        say({min: "8000000", max: "15000000"}, "observed", "2026-06-01", "últimas 12 emissões"),
      ],
    });
    const resolved = resolveMandate(mandate, {asOf: ASOF});
    // Declares R$20–80m, writes R$8–15m. The desk is told; the record is not rewritten.
    expect(resolved.divergences).toContain("ticket");
    expect(resolved.ticket?.value.min).toBe("20000000");
  });

  it("reports how long since we last heard anything about the fund", () => {
    const cold = resolveMandate(
      completeMandate({
        ticket: [say({min: "1", max: "2"}, "published", "2025-01-01")],
        termMonths: [say({min: 12, max: 24}, "published", "2025-01-01")],
        sectors: [say(["varejo"], "published", "2025-01-01")],
        instruments: [say(["debenture"] as const, "published", "2025-01-01")],
        collateral: [say(["recebiveis"] as const, "published", "2025-01-01")],
        geographies: [say(["BR"], "published", "2025-01-01")],
        leverageCeiling: [say("3.00", "published", "2025-01-01")],
        minimumDscr: [say("1.20", "published", "2025-01-01")],
        active: [say(true, "published", "2025-01-01")],
      }),
      {asOf: ASOF},
    );
    expect(cold.freshestMonths).toBeGreaterThan(18);
  });

  it("distinguishes an empty criterion from an unrestricted one", () => {
    // The distinction the whole model rests on: silence is not permission.
    const resolved = resolveMandate(completeMandate({sectors: []}), {asOf: ASOF});
    expect(resolved.sectors).toBeNull();
  });
});

describe("assessMandateFit", () => {
  it("says it fits when everything is known and everything agrees", () => {
    const fit = assessMandateFit(resolveMandate(completeMandate(), {asOf: ASOF}), fullRequest);
    expect(fit.verdict).toBe("fits");
    expect(fit.exclusions).toHaveLength(0);
    expect(fit.unlockedBy).toHaveLength(0);
  });

  it("answers from a one-page brief, before any document exists", () => {
    // Four facts, no data room. This is the moment the answer is worth the most.
    const fit = assessMandateFit(resolveMandate(completeMandate(), {asOf: ASOF}), {
      amount: "45000000",
      termMonths: 60,
      sector: "varejo",
      instruments: ["debenture"],
    });
    expect(fit.verdict).toBe("possible");
    // And it says exactly which documents would settle what is left.
    expect(fit.unlockedBy).toContain("financials_historical");
    expect(fit.unlockedBy).toContain("debt_schedule");
  });

  it("separates what the company can resolve from what only we can", () => {
    const partial = completeMandate({minimumDscr: []});
    const fit = assessMandateFit(resolveMandate(partial, {asOf: ASOF}), {
      amount: "45000000",
      termMonths: 60,
      sector: "varejo",
      geography: "BR",
      instruments: ["debenture"],
      collateral: ["recebiveis"],
      leverage: "2.80",
    });

    const dscr = fit.criteria.find((entry) => entry.id === "dscr")!;
    // We never asked this fund its minimum coverage. No document the company sends fixes that.
    expect(dscr.outcome).toBe("not_assessed");
    expect(dscr.resolvedBy).toBeUndefined();
    expect(fit.ourGaps).toContain("dscr");
    expect(fit.unlockedBy).not.toContain("debt_schedule");
  });

  it("excludes on instrument and explains that it is usually a rule, not a taste", () => {
    const fit = assessMandateFit(resolveMandate(completeMandate(), {asOf: ASOF}), {
      ...fullRequest,
      instruments: ["cri"],
    });
    expect(fit.verdict).toBe("excluded");
    expect(fit.exclusions.map((entry) => entry.id)).toEqual(["instrument"]);
    expect(fit.exclusions[0]!.explanation.pt).toContain("regra do próprio veículo");
  });

  it("tells a company below the minimum cheque why size alone excludes it", () => {
    const fit = assessMandateFit(resolveMandate(completeMandate(), {asOf: ASOF}), {...fullRequest, amount: "3000000"});
    expect(fit.verdict).toBe("excluded");
    expect(fit.exclusions[0]!.explanation.pt).toContain("custo de analisar é o mesmo");
  });

  it("suggests a syndicate rather than a dead end when the amount is too large", () => {
    const fit = assessMandateFit(resolveMandate(completeMandate(), {asOf: ASOF}), {...fullRequest, amount: "200000000"});
    expect(fit.exclusions[0]!.explanation.pt).toContain("dividida entre mais de um financiador");
  });

  it("does not let mismatched collateral kill a fund", () => {
    // Security moves price and structure; it is a conversation, not a wall.
    const fit = assessMandateFit(resolveMandate(completeMandate(), {asOf: ASOF}), {
      ...fullRequest,
      collateral: ["equipamento"],
    });
    expect(fit.verdict).toBe("possible");
    expect(fit.criteria.find((entry) => entry.id === "collateral")!.outcome).toBe("unknown");
  });

  it("says plainly when a fund is simply not deploying", () => {
    const fit = assessMandateFit(
      resolveMandate(completeMandate({active: [say(false, "conversation", "2026-08-01", "call com o gestor")]}), {asOf: ASOF}),
      fullRequest,
    );
    expect(fit.verdict).toBe("excluded");
    expect(fit.exclusions[0]!.explanation.pt).toContain("Não é sobre a sua operação");
  });

  it("explains that leverage is why we ask for the statements", () => {
    const {leverage: _omitted, ...withoutLeverage} = fullRequest;
    const fit = assessMandateFit(resolveMandate(completeMandate(), {asOf: ASOF}), withoutLeverage);
    const leverage = fit.criteria.find((entry) => entry.id === "leverage")!;
    expect(leverage.outcome).toBe("unknown");
    expect(leverage.resolvedBy).toBe("financials_historical");
    expect(leverage.explanation.pt).toContain("por isso que pedimos as demonstrações");
  });

  it("carries the divergence and the staleness into the match", () => {
    const mandate = completeMandate({
      ticket: [
        say({min: "20000000", max: "80000000"}, "declared", "2026-07-01"),
        say({min: "8000000", max: "15000000"}, "observed", "2026-06-01"),
      ],
    });
    const fit = assessMandateFit(resolveMandate(mandate, {asOf: ASOF}), fullRequest);
    expect(fit.divergences).toContain("ticket");
    expect(fit.criteria.find((entry) => entry.id === "ticket")!.divergent).toBe(true);
    // The declared box admits R$45m, so the fund is not excluded — but a person can now see
    // that its last twelve deals were a quarter of that before spending a call on it.
    expect(fit.verdict).toBe("fits");
  });

  it("is bilingual in every explanation it produces", () => {
    const fit = assessMandateFit(resolveMandate(completeMandate(), {asOf: ASOF}), {});
    for (const entry of fit.criteria) {
      expect(entry.explanation.pt.length, entry.id).toBeGreaterThan(10);
      expect(entry.explanation.en.length, entry.id).toBeGreaterThan(10);
      expect(entry.labels.pt.length, entry.id).toBeGreaterThan(0);
      expect(entry.labels.en.length, entry.id).toBeGreaterThan(0);
    }
  });
});

describe("ranking and structural findings", () => {
  const fund = (id: string, name: string, overrides: Partial<Mandate>) =>
    resolveMandate(completeMandate({fundId: id, fundName: name, ...overrides}), {asOf: ASOF});

  it("orders by verdict, then by how little is unknown, then by how recently we spoke", () => {
    const brief: DealRequest = {amount: "45000000", termMonths: 60, sector: "varejo", instruments: ["debenture"]};
    const out = assessMandateFit(fund("a", "Fora", {sectors: [say(["saúde"], "declared", "2026-07-01")]}), brief);
    const maybe = assessMandateFit(fund("b", "Talvez", {}), brief);
    const solid = assessMandateFit(fund("c", "Encaixa", {}), {...brief, geography: "BR", collateral: ["recebiveis"], leverage: "2.0", dscr: "1.5"});

    expect(rankFits([out, maybe, solid]).map((entry) => entry.fundName)).toEqual(["Encaixa", "Talvez", "Fora"]);
  });

  it("names a finding about the operation when every fund is out for the same reason", () => {
    // Fifty noes on ticket is not fifty rejections; it is one fact about the amount, and it is
    // deliverable on day one while the structure can still change.
    const brief: DealRequest = {...fullRequest, amount: "2000000"};
    const fits = [
      assessMandateFit(fund("a", "A", {}), brief),
      assessMandateFit(fund("b", "B", {ticket: [say({min: "20000000", max: "90000000"}, "declared", "2026-07-01")]}), brief),
    ];
    expect(structuralExclusions(fits)).toEqual(["ticket"]);
  });

  it("does not call one fund's taste a structural problem", () => {
    const brief: DealRequest = {...fullRequest, sector: "saúde"};
    const fits = [
      assessMandateFit(fund("a", "A", {sectors: [say(["saúde"], "declared", "2026-07-01")]}), brief),
      assessMandateFit(fund("b", "B", {}), brief),
    ];
    // One fund takes the sector, so the sector is not the problem — that fund is the answer.
    expect(structuralExclusions(fits)).toEqual([]);
  });

  it("reports nothing structural when nothing was assessed", () => {
    expect(structuralExclusions([])).toEqual([]);
  });
});
