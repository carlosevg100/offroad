import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import {beforeAfterV8InputSchema, compareRefinancingBeforeAfter, compareRefinancingBeforeAfterV8, type BeforeAfterV8Input} from "./compare-refinancing-before-after";
import {camil} from "../cases/gc01/compare-refinancing-before-after";

/** Explicit synthetic examples; no reviewed customer document or authorization is claimed. */
function example(currency: "BRL" | "USD", amount: string): BeforeAfterV8Input {
  const anchor = {document: `synthetic-${currency}`, note: currency};
  const value = (value: string) => ({value, anchor});
  const review = {reviewerId: "synthetic-reviewer", reviewedAt: "2026-09-01", rationale: "Synthetic explicit absence of applicable financial covenants", sources: [{documentId: anchor.document, version: 1, fingerprint: "a".repeat(64), issuedAt: "2026-01-01", effectiveDate: "2026-01-01", expiresAt: null, anchor: "clause 12"}]};
  return {schemaVersion: "refinancing-comparison-input.v8", knowledgeAsOf: "2026-09-08", economics: {
    referenceDate: "2026-09-08", unit: currency, unitAnchor: anchor,
    before: {grossDebt: value(amount), unrestrictedCash: value("25"), derivativeAssets: value("0"), derivativeLiabilities: value("0"), ltmEbitda: null, schedule: [{period: "2027", amount, endsAt: "2027-12-31", kind: "maturity", anchor}], costOfExistingDebt: {weightedAverageRate: "0.1", basis: "contractual", anchor}, cfadsByPeriod: null},
    covenants: [], alternatives: [{id: "keep", label: "Maintain", newDebt: null, retired: [], feesPaidFromCash: value("0"), uncoveredTerms: []},
      {id: "fund", label: "Declared financing", newDebt: {amount: "50", annualRate: "0.12", termMonths: 12, graceMonths: 0, format: "sac", upfrontFeeRate: "0", disbursementDate: "2026-09-09", origin: "synthetic scenario", termsSource: "indicative_unverified", anchor}, retired: [], feesPaidFromCash: value("0"), uncoveredTerms: []}],
    ranking: {discriminator: "net_debt", rationale: "Compare declared debt amounts"}, wallThreshold: {share: "0.5", policyKey: "synthetic-policy", policyVersion: "1"}},
    instrumentScope: [{instrumentId: "loan", role: "existing", alternativeId: null}, {instrumentId: "new-loan", role: "proposed", alternativeId: "fund"}],
    coverage: ["loan", "new-loan"].map((instrumentId) => ({instrumentId, state: "reviewed_none_applicable", covenantIds: [], review})), covenants: [],
    paymentConventions: [{instrumentId: "new-loan", rateType: "fixed", rateBasis: "effective_annual", paymentFrequency: "monthly", paymentDateAdjustment: "none", graceInterest: "paid"}]};
}

describe("opt-in diagnostic covenant coverage v8", () => {
  it.each([["BRL", "123.45"], ["USD", "987.65"]] as const)("reuses arithmetic for independent %s example", (currency, amount) => {
    const input = example(currency, amount);
    const result = compareRefinancingBeforeAfterV8(input);
    const legacy = compareRefinancingBeforeAfter({...input.economics, covenants: [{instrument: "loan", limit: "4", direction: "maximum", measurement: {frequency: "annual", nextDate: "2026-12-31"}, tiers: null, state: "insufficient_evidence", comparability: "not_comparable", anchor: {document: "synthetic-definition-absent"}}]});
    expect(result.before.gross_debt).toBe(amount);
    expect(result.before).toEqual(legacy.before);
    expect(result.alternatives).toEqual(legacy.alternatives);
    expect(result.ranking).toEqual(legacy.ranking);
    expect(result.schema_version).toBe("method.compare-refinancing-before-after.v8");
    expect(result.usage).toBe("diagnostic_only");
    expect(result.review_validation).toBe("reference_consistency_only");
    expect(result.before.headroom).toBeNull();
    expect(result.coverage_status).toBe("declared_complete");
  });
  it("unknown coverage permits partial comparison but no headroom or headroom ranking", () => {
    const input = example("BRL", "100");
    input.coverage[0] = {instrumentId: "loan", state: "unknown", covenantIds: [], reason: "Amendments unavailable"};
    input.economics.ranking = {discriminator: "headroom", rationale: "Requested comparison"};
    const result = compareRefinancingBeforeAfterV8(input);
    expect(result.coverage_status).toBe("partial");
    expect(result.before.net_debt).toBe("75");
    expect(result.ranking).toBeNull();
    expect(result.limitations).toContain("headroom_ranking_unavailable");
  });
  it("retains multiple distinct metrics on one instrument without measuring either", () => {
    const input = example("BRL", "100");
    const none = input.coverage[0]!;
    if (none.state === "unknown") throw new Error("fixture");
    input.coverage[0] = {...none, state: "reviewed_applicable", covenantIds: ["leverage", "dscr"]};
    input.covenants = [{instrumentId: "loan", covenantId: "leverage", metricKey: "contractual-net-leverage"}, {instrumentId: "loan", covenantId: "dscr", metricKey: "debt-service-coverage"}];
    const result = compareRefinancingBeforeAfterV8(input);
    expect(result.covenant_measurements).toHaveLength(2);
    expect(result.covenant_measurements.every((item) => item.state === "not_measured")).toBe(true);
    expect(result.before.headroom_by_instrument).toEqual([]);
  });
  it.each(["missing", "duplicate", "contradiction", "proposed", "convention", "fees", "future", "expired", "hash"])("rejects %s coverage/input", (kind) => {
    const input = example("BRL", "100");
    const entry = input.coverage[0]!;
    if (entry.state === "unknown") throw new Error("fixture");
    if (kind === "missing") input.coverage.pop();
    if (kind === "duplicate") input.coverage.push(entry);
    if (kind === "contradiction") input.covenants.push({covenantId: "hidden", instrumentId: "loan", metricKey: "dscr"});
    if (kind === "proposed") input.instrumentScope[1]!.alternativeId = "keep";
    if (kind === "convention") input.paymentConventions = [];
    if (kind === "fees") input.economics.alternatives[1]!.feesPaidFromCash = null;
    if (kind === "future") entry.review.reviewedAt = "2027-01-01";
    if (kind === "expired") entry.review.sources[0]!.expiresAt = "2026-08-01";
    if (kind === "hash") entry.review.sources[0]!.fingerprint = "invalid";
    expect(beforeAfterV8InputSchema.safeParse(input).success).toBe(false);
  });
  it("refuses unsupported indexation and capitalized grace instead of assuming the supported convention", () => {
    const input = example("BRL", "100");
    expect(beforeAfterV8InputSchema.safeParse({...input, paymentConventions: [{...input.paymentConventions[0], rateType: "CDI"}]}).success).toBe(false);
    expect(beforeAfterV8InputSchema.safeParse({...input, paymentConventions: [{...input.paymentConventions[0], paymentDateAdjustment: "following_business_day"}]}).success).toBe(false);
    expect(beforeAfterV8InputSchema.safeParse({...input, paymentConventions: [{...input.paymentConventions[0], graceInterest: "capitalized"}]}).success).toBe(false);
  });
  it("hashes sorted canonical coverage deterministically and changes identity with review version", () => {
    const input = example("BRL", "100");
    const before = compareRefinancingBeforeAfterV8(input);
    input.coverage.reverse(); input.instrumentScope.reverse(); input.economics.alternatives.reverse();
    expect(compareRefinancingBeforeAfterV8(input).trace).toEqual(before.trace);
    const entry = input.coverage[0]!;
    if (entry.state !== "unknown") entry.review.sources[0]!.version = 2;
    expect(compareRefinancingBeforeAfterV8(input).trace.inputFingerprint).not.toBe(before.trace.inputFingerprint);
  });
  it("preserves the original v7 Case01 schema, input and output golden fingerprints", () => {
    const result = compareRefinancingBeforeAfter(camil());
    expect(result.schema_version).toBe("method.compare-refinancing-before-after.v7");
    expect(result.trace.inputFingerprint).toBe("21004a80d8377ee8deb0bd8bff0503492d1685d2194b8fca39f9e9879aef338f");
    expect(result.trace.outputFingerprint).toBe("bbcab52a46866632a81fd292cd73e6be6717be5440fabf62429029334fa83d04");
  });
});

it("separates review knowledge date from historical reference and future proposed effectiveness", () => {
  const input = example("BRL", "100");
  input.economics.referenceDate = "2026-05-31";
  input.knowledgeAsOf = "2026-09-08";
  const proposed = input.coverage[1]!;
  if (proposed.state === "unknown") throw new Error("fixture");
  proposed.review = structuredClone(proposed.review);
  proposed.review.sources[0]!.documentId = "synthetic-future-proposal";
  proposed.review.sources[0]!.effectiveDate = "2026-09-09";
  expect(beforeAfterV8InputSchema.safeParse(input).success).toBe(true);
  proposed.review.sources[0]!.expiresAt = "2026-09-08";
  expect(beforeAfterV8InputSchema.safeParse(input).success).toBe(false);
});

it("allows distinct locators in one document version but rejects contradictory content hashes", () => {
  const input = example("BRL", "100");
  input.coverage = structuredClone(input.coverage);
  const second = input.coverage[1]!;
  if (second.state === "unknown") throw new Error("fixture");
  second.review = structuredClone(second.review);
  second.review.sources[0]!.anchor = "clause 15, page 20";
  expect(beforeAfterV8InputSchema.safeParse(input).success).toBe(true);
  second.review.sources[0]!.fingerprint = "b".repeat(64);
  expect(beforeAfterV8InputSchema.safeParse(input).success).toBe(false);
});

it("binds v8 output identity to calculations and canonical input identity", () => {
  const result = compareRefinancingBeforeAfterV8(example("BRL", "100"));
  const {trace, ...body} = result;
  const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value, (_key, inner: unknown) => inner && typeof inner === "object" && !Array.isArray(inner) ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : inner)).digest("hex");
  const signed = {...body, calculations: trace.calculations, inputFingerprint: trace.inputFingerprint};
  expect(trace.outputFingerprint).toBe(hash(signed));
  expect(hash({...signed, inputFingerprint: "f".repeat(64)})).not.toBe(trace.outputFingerprint);
  const calculations = structuredClone(trace.calculations);
  calculations[0]!.result = "123456";
  expect(hash({...signed, calculations})).not.toBe(trace.outputFingerprint);
});


it("reconciles a distinct partial refinancing with explicit exit costs, fees and retained principal", () => {
  const input = example("BRL", "100");
  const alternative = input.economics.alternatives[1]!;
  const anchor = {document: "synthetic-partial-refinancing", note: "BRL; explicit nominal and costs for this synthetic scenario"};
  alternative.retired = [{seriesId: "loan", instalments: [{period: "2027", principal: {value: "50", basis: "contractual_nominal", anchor}, maturityAnchor: anchor}], exitPremium: {value: "1", mechanism: "synthetic-permitted-exit", permittedOnDate: true, anchor}}];
  alternative.feesPaidFromCash = {value: "2", anchor};
  alternative.newDebt!.upfrontFeeRate = "0.02";
  const result = compareRefinancingBeforeAfterV8(input);
  const fund = result.alternatives.find((item) => item.id === "fund")!;
  expect(fund.state).toBe("compared");
  expect(fund.after?.gross_debt).toBe("100"); // 100 + 50 - 50
  expect(fund.after?.deductible_cash).toBe("21"); // 25 - 1 exit - 2 cash fees - 1 upfront
  expect(fund.after?.net_debt).toBe("79");
  expect(fund.concentration?.[0]).toMatchObject({existing: "50", proposed: "50", consolidated: "100"});
  expect(fund.exit_cost?.value).toBe("1");
  expect(result.ranking?.order.find((item) => item.id === "fund")?.value).toBe("79");
  expect(result.limitations).toContain("nominal_cash_and_exit_quote_scope_not_authenticated");
  alternative.retired[0]!.seriesId = "not-in-ledger-scope";
  expect(beforeAfterV8InputSchema.safeParse(input).success).toBe(false);
});


it.each(["29", "30", "31"])("refuses unbound month-end convention for January %s", (day) => {
  const input = example("BRL", "100");
  input.economics.alternatives[1]!.newDebt!.disbursementDate = `2027-01-${day}`;
  const parsed = beforeAfterV8InputSchema.safeParse(input);
  expect(parsed.success).toBe(false);
  if (!parsed.success) expect(parsed.error.issues.some((item) => item.message.includes("unsupported_month_end_payment_convention"))).toBe(true);
});

it("keeps the first monthly principal in February for a supported January 28 disbursement", () => {
  const input = example("BRL", "100");
  const anchor = {document: "synthetic-calendar", note: "BRL; calendar months without business-day adjustment"};
  input.economics.before.schedule = [
    {period: "feb", amount: "0", endsAt: "2027-02-28", kind: "maturity", anchor},
    {period: "mar", amount: "0", endsAt: "2027-03-31", kind: "maturity", anchor},
    {period: "later", amount: "100", endsAt: null, kind: "maturity", anchor},
  ];
  input.economics.alternatives[1]!.newDebt!.disbursementDate = "2027-01-28";
  input.economics.alternatives[1]!.newDebt!.amount = "120";
  const fund = compareRefinancingBeforeAfterV8(input).alternatives.find((item) => item.id === "fund")!;
  expect(fund.concentration?.find((item) => item.period === "feb")?.proposed).toBe("10");
  expect(fund.concentration?.find((item) => item.period === "mar")?.proposed).toBe("10");
});
