import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";

import {contractMismatch} from "./contract";

import {declareScenarios, type ScenarioInput} from "./declare-scenarios";
import {d, itr, user, asOf, goldDocuments, sha, manifest, documents, gold, camil, by} from "../cases/gc01/declare-scenarios";

describe("declare-scenarios executor (v6)", () => {
  it("gold on the frozen corpus: no CFADS, shock or haircut can be sourced, so the minimum set is blocked and nothing is filled", () => {
    const result = declareScenarios(gold());
    expect(result.schema_version).toBe("method.declare-scenarios.v6");
    expect(result.state).toBe("blocked");
    expect(result.block_reasons.some((reason) => /^adverse:/.test(reason))).toBe(true);
    expect(by(result, "adverse").state).toBe("blocked");
    expect(by(result, "base").state).toBe("partial");
    expect(by(result, "base").results.liquidity).toBeNull();
    expect(by(result, "base").uncovered_terms.map((term) => term.id)).toEqual(expect.arrayContaining(["cfads:2026/27", "cfads:2027/28"]));
    expect(by(result, "base").results.pro_forma.contractual_net_debt).toBe("4228477");
    expect(by(result, "base").results.pro_forma.leverage?.value).toBe("4.72");
    // A document outside the frozen manifest, or with another hash, is refused.
    expect(() => declareScenarios({...gold(), documents: [...goldDocuments, {name: "declaracao_do_usuario.md", kind: "user", sha256: sha("b2")}]})).toThrow(/not in the corpus manifest/);
    expect(() => declareScenarios({...gold(), documents: goldDocuments.map((document) => (document.kind === "itr" ? {...document, sha256: sha("a1")} : document))})).toThrow(/carries a hash the manifest does not record/);
  });

  it("gold: net debt follows the contractual components, leverage carries the EBITDA's comparability, no headroom against an inapplicable unresolved tier, and every number carries origins with anchors", () => {
    const result = declareScenarios(camil());
    expect(result.schema_version).toBe("method.declare-scenarios.v6");
    expect(result.state).toBe("partial");
    for (const scenario of result.scenarios) {
      expect(scenario.caveat).toMatch(/não é guidance da companhia/);
      expect(scenario.results.pro_forma.contractual_net_debt).toBe("4228477");
      expect(scenario.results.pro_forma.deductible_cash).toBe("1455809");
      expect(scenario.results.pro_forma.origins.map((origin) => origin.key)).toEqual(expect.arrayContaining(["position.grossDebt", "position.cashAndEquivalents", "position.ltmEbitda"]));
      expect(scenario.results.headroom).toBeNull();
      expect(scenario.results.headroom_note).toMatch(/no headroom: the limit of 13ª emissão is insufficient_evidence; the 4.00x tier is conditional \(4,00x aplicável/);
      expect(scenario.uncovered_terms.some((term) => term.id === "interest:2026/27")).toBe(true);
    }
    const base = by(result, "base");
    // The EBITDA is implied from a two-decimal index: the leverage is an approximation shown to two decimals.
    expect(base.results.pro_forma.leverage?.value).toBe("4.72");
    expect(base.results.pro_forma.leverage?.precision).toBe("approximate_two_decimals");
    expect(base.results.pro_forma.leverage?.comparability_by_instrument.find((entry) => entry.instrument === "13ª emissão")?.comparability).toBe("conditional");
    expect(base.results.headroom_note).toMatch(/arithmetic difference against 4.00x is -0.72x and is conditioned/);
    expect(base.results.headroom_note).toMatch(/the EBITDA is conditional with the definition of 13ª emissão/);
    expect(base.parameters.map((parameter) => parameter.role)).toEqual(["rollover", "cfads", "cfads"]);
    expect(base.caveat).toMatch(/intervalo declarado pelo usuário \(rollover.bank_lines: rolagem integral/);
    expect(base.results.liquidity?.basis).toBe("principal_only");
    expect(base.results.liquidity?.rows[0]?.origins.map((origin) => origin.key)).toEqual(["position.cashAndEquivalents", "position.financialInvestments", "periods.2026/27.principal", "cfads.2026-27.range", "rollover.bank_lines"]);
    // The second period rests on everything before it: the opening cash and the first period's inputs.
    expect(base.results.liquidity?.rows[1]?.origins.map((origin) => origin.key)).toEqual(["position.cashAndEquivalents", "position.financialInvestments", "periods.2026/27.principal", "cfads.2026-27.range", "rollover.bank_lines", "periods.2027/28.principal", "cfads.2027-28.range"]);
    expect(result.assumption_register.filter((entry) => entry.selected).map((entry) => entry.key)).toEqual(["cfads.2026-27.range", "cfads.2027-28.range", "haircut.cfads.adverse", "haircut.ebitda.adverse", "rollover.bank_lines", "shock.rate.parallel"]);
  });

  it("gold: the adverse scenario shocks the rate, haircuts the EBITDA and the CFADS separately; the no-rollover scenario shows the deficit that rollover hides", () => {
    const result = declareScenarios(camil());
    const adverse = by(result, "adverse");
    expect(adverse.results.interest?.delta).toBe("106585.69");
    // The shock delta stands apart: the service of a period never carries a share of it.
    expect(adverse.results.liquidity?.rows[0]?.coverage).toBe(by(result, "base").results.liquidity?.rows[0]?.coverage === null ? null : adverse.results.liquidity?.rows[0]?.coverage);
    expect(result.trace.calculations.find((calculation) => calculation.id === "financial.liquidity_coverage:2026/27" && calculation.scenario === "adverse")?.operands.debtService).toBe("1229828");
    expect(adverse.results.pro_forma.leverage?.value).toBe(d("4228477").div(d("895864").times("0.85")).toDecimalPlaces(2).toFixed());
    expect(adverse.results.liquidity?.rows[0]?.cfads_declared).toBe("200000");
    expect(adverse.results.liquidity?.rows[0]?.cfads_used).toBe("180000");
    expect(adverse.results.liquidity?.rows[0]?.cfads_haircut).toBe("0.10");
    const base = by(result, "base");
    expect(base.results.liquidity?.rows[0]?.cfads_used).toBe("200000");
    expect(base.results.liquidity?.rows.every((row) => row.deficit === "0")).toBe(true);
    expect(base.results.liquidity?.rows[1]?.rolled_principal).toBe("776868");
    const noRollover = by(result, "no_rollover");
    expect(noRollover.results.liquidity?.rows.every((row) => row.rolled_principal === "0" && row.contracted_sources === "0")).toBe(true);
    // 1.455.809 + 200.000 - 1.229.828 = 425.981 carried; 425.981 + 200.000 against 776.868 leaves 150.887 uncovered.
    expect(noRollover.results.liquidity?.rows[0]?.deficit).toBe("0");
    expect(noRollover.results.liquidity?.rows[1]?.deficit).toBe("150887");
    expect(noRollover.parameters.some((parameter) => parameter.role === "rollover")).toBe(false);
  });

  it("blocks a scenario whose lever has no registered assumption instead of filling zero, and blocks the run when a minimum scenario is blocked", () => {
    const base = camil();
    const noHaircut = declareScenarios({...base, assumptions: base.assumptions.filter((assumption) => assumption.role !== "ebitda_haircut")});
    expect(by(noHaircut, "adverse").state).toBe("blocked");
    expect(by(noHaircut, "adverse").block_reasons[0]).toMatch(/EBITDA haircut but none is registered; the haircut is not filled with zero/);
    expect(by(noHaircut, "adverse").results.pro_forma.leverage).toBeNull();
    expect(noHaircut.state).toBe("blocked");
    expect(noHaircut.block_reasons[0]).toMatch(/^adverse:/);
    const noRolloverAssumption = declareScenarios({...base, assumptions: base.assumptions.filter((assumption) => assumption.role !== "rollover")});
    expect(by(noRolloverAssumption, "base").state).toBe("blocked");
    expect(by(noRolloverAssumption, "no_rollover").state).toBe("partial");
    const halfRefinancing = declareScenarios({...base, assumptions: [...base.assumptions, {key: "refi.new", role: "new_debt", period: null, value: "300000", unit: "BRL thousand", origin: "user_range", rationale: "nova dívida declarada", asOf, anchor: user(), confidence: "low"}], scenarios: [...base.scenarios, {id: "refi", label: "Refinanciamento", rolloverAllowed: false, usesRefinancing: true}]});
    expect(by(halfRefinancing, "refi").state).toBe("blocked");
    expect(halfRefinancing.state).toBe("partial");
  });

  it("never repeats CFADS across periods: a period without its own CFADS leaves the cover unmeasured", () => {
    const base = camil();
    const result = declareScenarios({...base, assumptions: base.assumptions.filter((assumption) => assumption.key !== "cfads.2027-28.range")});
    expect(by(result, "base").results.liquidity).toBeNull();
    expect(by(result, "base").uncovered_terms.some((term) => term.id === "cfads:2027/28" && /no figure is repeated from another period/.test(term.reason))).toBe(true);
    expect(by(result, "base").state).toBe("partial");
  });

  it("measures headroom only against an applicable, resolved and comparable limit with a comparable EBITDA", () => {
    const base = camil();
    const resolved: ScenarioInput = {...base, covenant: {...base.covenant!, state: "resolved", comparability: "comparable", tier: {applicability: "applicable", condition: "quitação ordinária dos CRA provada (hipótese de teste)"}}, position: {...base.position, ltmEbitda: {...base.position.ltmEbitda!, basis: "company_opened", comparabilityByInstrument: [{instrument: "13ª emissão", comparability: "comparable", reasons: []}, {instrument: "11ª emissão", comparability: "conditional", reasons: ["ajuste de aquisições"]}]}}};
    const result = declareScenarios(resolved);
    expect(by(result, "base").results.headroom?.absolute).toBe(d("4").minus(d("4228477").div("895864").toDecimalPlaces(8)).toDecimalPlaces(8).toFixed());
    expect(by(result, "base").results.headroom?.within_limit).toBe(false);
    expect(by(result, "base").results.headroom?.note).toMatch(/scenario reading before the measurement of 2027-02-28/);
    const inapplicable = declareScenarios({...resolved, covenant: {...resolved.covenant!, tier: {applicability: "not_applicable", condition: "degrau posterior"}}});
    expect(by(inapplicable, "base").results.headroom).toBeNull();
    expect(by(inapplicable, "base").results.headroom_note).toMatch(/is not applicable/);
    const conditional = declareScenarios({...resolved, covenant: {...resolved.covenant!, tier: {applicability: "conditional", condition: "quitação a provar"}}});
    expect(by(conditional, "base").results.headroom).toBeNull();
    expect(by(conditional, "base").results.headroom_note).toMatch(/is conditional \(quitação a provar\)/);
    const conditionalEbitda = declareScenarios({...resolved, position: {...resolved.position, ltmEbitda: {...resolved.position.ltmEbitda!, comparabilityByInstrument: [{instrument: "13ª emissão", comparability: "conditional", reasons: ["sem abertura"]}]}}});
    expect(by(conditionalEbitda, "base").results.headroom_note).toMatch(/the EBITDA is conditional with the definition of 13ª emissão \(sem abertura\)/);
    // The headroom follows the covenant's instrument: a reading for another instrument only is no reading.
    const otherInstrument = declareScenarios({...resolved, position: {...resolved.position, ltmEbitda: {...resolved.position.ltmEbitda!, comparabilityByInstrument: [{instrument: "11ª emissão", comparability: "comparable", reasons: []}]}}});
    expect(by(otherInstrument, "base").results.headroom).toBeNull();
    expect(by(otherInstrument, "base").results.headroom_note).toMatch(/carries no comparability reading for 13ª emissão/);
  });

  it("refuses an origin on a document of the wrong class, an announcement posing as a contracted source, a relabelled scale, an annualized quarterly EBITDA, out-of-range ratios and negative money", () => {
    const base = camil();
    const disguised = {...base, assumptions: base.assumptions.map((assumption) => assumption.key === "cfads.2026-27.range" ? {...assumption, origin: "authorized_management_data" as const} : assumption)};
    expect(() => declareScenarios(disguised)).toThrow(/cannot rest on a user document; it needs management/);
    // History proves past rollovers, never a policy for future maturities.
    const historicRollover = {...base, assumptions: base.assumptions.map((assumption) => assumption.role === "rollover" ? {...assumption, origin: "company_history" as const, anchor: itr(16, "DFC")} : assumption)};
    expect(() => declareScenarios(historicRollover)).toThrow(/history, not a policy for future maturities/);
    // Documents are checked against the manifest by name and hash.
    expect(() => declareScenarios({...base, documents: base.documents.map((document) => (document.name === "reference-data.ts" ? {...document, sha256: sha("ff")} : document))})).toThrow(/carries a hash the manifest does not record/);
    expect(() => declareScenarios({...base, documents: [...base.documents, {name: "documento_fora_do_manifesto.pdf", kind: "other", sha256: sha("ee")}]})).toThrow(/not in the corpus manifest/);
    expect(() => declareScenarios({...base, manifest: [...base.manifest, {name: "reference-data.ts", sha256: sha("dd")}]})).toThrow(/duplicate manifest entry reference-data.ts/);
    expect(() => declareScenarios({...base, position: {...base.position, ltmEbitda: {...base.position.ltmEbitda!, comparabilityByInstrument: [...base.position.ltmEbitda!.comparabilityByInstrument, {instrument: "13ª emissão", comparability: "comparable", reasons: []}]}}})).toThrow(/duplicate comparability reading for 13ª emissão/);
    // The adverse scenario of the minimum set needs the rate shock and the EBITDA haircut, both.
    expect(() => declareScenarios({...base, scenarios: base.scenarios.map((scenario) => (scenario.id === "adverse" ? {...scenario, usesRateShock: false} : scenario))})).toThrow(/shocks the rate and haircuts the EBITDA, both/);
    const announcement = {...base, assumptions: [...base.assumptions, {key: "source.notas", role: "contracted_source" as const, period: "2026/27", value: "251000", unit: "BRL thousand" as const, origin: "public_announcement" as const, rationale: "notas comerciais aprovadas", asOf, anchor: {document: "ca_notas_comerciais_2026-05-27.pdf", page: 2}, confidence: "medium" as const, evidence: {contract: {document: "ca_notas_comerciais_2026-05-27.pdf", page: 2}, disbursement: null}}]};
    expect(() => declareScenarios(announcement)).toThrow(/needs its contract and its disbursement/);
    const contracted = {...base, assumptions: [...base.assumptions, {key: "source.notas", role: "contracted_source" as const, period: "2026/27", value: "251000", unit: "BRL thousand" as const, origin: "public_announcement" as const, rationale: "notas comerciais contratadas e desembolsadas (hipótese)", asOf, anchor: {document: "ca_notas_comerciais_2026-05-27.pdf", page: 2}, confidence: "medium" as const, evidence: {contract: {document: "contrato_hipotetico.pdf"}, disbursement: {document: "extrato_hipotetico.pdf"}}}]};
    const withSource = declareScenarios(contracted);
    expect(by(withSource, "no_rollover").results.liquidity?.rows[0]?.contracted_sources).toBe("251000");
    expect(by(withSource, "no_rollover").parameters.find((parameter) => parameter.key === "source.notas")?.evidence).toEqual({contract: {document: "contrato_hipotetico.pdf"}, disbursement: {document: "extrato_hipotetico.pdf"}});
    expect(withSource.assumption_register.find((entry) => entry.key === "source.notas")?.evidence?.disbursement).toEqual({document: "extrato_hipotetico.pdf"});
    expect(by(withSource, "no_rollover").results.liquidity?.rows[0]?.origins.find((origin) => origin.key === "source.notas")?.evidence?.contract).toEqual({document: "contrato_hipotetico.pdf"});
    expect(() => declareScenarios({...base, unit: "BRL million"})).toThrow(/does not name the unit BRL million/);
    expect(() => declareScenarios({...base, position: {...base.position, ltmEbitda: {...base.position.ltmEbitda!, periodStart: "2026-02-28"}}})).toThrow(/not twelve months; an annualized shorter period is not an LTM figure/);
    expect(() => declareScenarios({...base, assumptions: base.assumptions.map((assumption) => assumption.role === "rate_shock" ? {...assumption, value: "0"} : assumption)})).toThrow(/of zero is not a stress/);
    expect(() => declareScenarios({...base, documents: base.documents.map((document) => ({...document, sha256: "abc"}))})).toThrow();
    const mixed = declareScenarios({...base, periods: base.periods.map((period, index) => (index === 0 ? {...period, interest: {value: "100000", anchor: itr(40, "juros hipotéticos do primeiro período")}} : period))});
    expect(by(mixed, "base").results.liquidity?.basis).toBe("mixed");
    expect(by(mixed, "base").results.liquidity?.rows.map((row) => row.basis)).toEqual(["full_debt_service", "principal_only"]);
    expect(by(mixed, "base").uncovered_terms.map((term) => term.id)).toContain("interest:2027/28");
    expect(by(mixed, "base").uncovered_terms.map((term) => term.id)).not.toContain("interest:2026/27");
    expect(() => declareScenarios({...base, assumptions: base.assumptions.map((assumption) => assumption.role === "ebitda_haircut" ? {...assumption, value: "1.5"} : assumption)})).toThrow(/lies between 0 and 1/);
    expect(() => declareScenarios({...base, assumptions: base.assumptions.map((assumption) => assumption.role === "cfads" ? {...assumption, value: "-1"} : assumption)})).toThrow();
    expect(() => declareScenarios({...base, assumptions: base.assumptions.map((assumption) => assumption.role === "cfads" ? {...assumption, anchor: {document: "inventado.pdf"}} : assumption)})).toThrow(/not a document of the base/);
    expect(() => declareScenarios({...base, covenant: {...base.covenant!, measurement: {frequency: "annual", nextDate: "2026-02-28"}}})).toThrow(/next measurement date must follow/);
  });

  it("is consistent under twenty permutations of assumptions, documents, periods, scenarios, reasons and key order", () => {
    const first = declareScenarios(camil());
    const permute = <T>(items: readonly T[], seed: number): T[] => { const copy = [...items]; let state = seed; for (let index = copy.length - 1; index > 0; index -= 1) { state = (state * 1103515245 + 12345) % 2147483648; const swap = state % (index + 1); [copy[index], copy[swap]] = [copy[swap]!, copy[index]!]; } return copy; };
    const reversedKeys = <T,>(value: T): T => (Array.isArray(value) ? value.map(reversedKeys) as T : value && typeof value === "object" ? Object.fromEntries(Object.entries(value as Record<string, unknown>).reverse().map(([key, inner]) => [key, reversedKeys(inner)])) as T : value);
    for (let seed = 1; seed <= 20; seed += 1) {
      const base = camil();
      const shuffled: ScenarioInput = {...base, assumptions: permute(base.assumptions, seed), documents: permute(base.documents, seed + 1), manifest: permute(base.manifest, seed + 5), periods: permute(base.periods, seed + 2), scenarios: permute(base.scenarios, seed + 3), position: {...base.position, ltmEbitda: {...base.position.ltmEbitda!, comparabilityByInstrument: permute(base.position.ltmEbitda!.comparabilityByInstrument, seed + 4)}}};
      const again = declareScenarios(seed % 2 ? reversedKeys(shuffled) : shuffled);
      expect(again.trace.inputFingerprint).toBe(first.trace.inputFingerprint);
      expect(again.trace.outputFingerprint).toBe(first.trace.outputFingerprint);
    }
  });

  it("emits exactly the top-level outputs the method declares", () => {
    expect(contractMismatch(declareScenarios(camil()) as unknown as Record<string, unknown>, "scenarios/declare-scenarios.md")).toEqual([]);
  });
});
