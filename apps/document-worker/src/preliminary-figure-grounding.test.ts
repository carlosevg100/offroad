import {describe, expect, it} from "vitest";
import {preliminaryFigureValidator} from "./preliminary-figure-grounding";
import {createModelGateway} from "@offroad/model-gateway";
import {z} from "zod";

const source = (value: string, extra: Record<string, unknown> = {}) => ({field_path: "transaction.requested_amount", normalized_value: value, raw_value: value, value_type: "number", unit: "money", currency: "BRL", anchor_verified: true, review_state: "proposed", ...extra});
const narrative = (text: string) => ({understandingSummary: text, companySummary: "Empresa de distribuição.", operationSummary: "Pedido de capital de giro.", capitalObjective: null, sectorSummary: null, positioningSummary: null, openPoints: [], researchSignals: []});
const validator = (candidates: Record<string, unknown>[], extra: Partial<Parameters<typeof preliminaryFigureValidator>[0]> = {}) => preliminaryFigureValidator({locale: "pt", candidates, userTexts: [], declaredAmount: null, declaredCurrency: null, publicSources: [], ...extra});

describe("preliminary figures grounded in the supplied evidence", () => {
  it.each(["R$ 3 milhões", "BRL 3.000.000,00", "3 milhões de reais", "3.000.000 reais"])("recognizes the same source amount as %s without new financial arithmetic", text => {
    expect(validator([source("3000000")])(narrative(text))).toEqual({accepted: true});
  });
  it("rejects a new difference even when both operands appear in verified sources", () => {
    const result = validator([source("8800000"), source("7800000")])(narrative("Uma divergência de R$ 1 milhão entre as duas fontes."));
    expect(result).toMatchObject({accepted: false, issues: [{path: "understandingSummary", code: "preliminary_figure_not_supported"}]});
    expect(JSON.stringify(result)).not.toMatch(/8800000|7800000|milhão|divergência/);
  });
  it("keeps amount and currency paired", () => {
    const validate = validator([source("3000000"), source("500000", {currency: "USD"})]);
    expect(validate(narrative("US$ 3 milhões"))).toMatchObject({accepted: false});
    expect(validate(narrative("US$ 500 mil"))).toEqual({accepted: true});
  });
  it.each([{anchor_verified: false}, {review_state: "rejected"}, {review_state: "not_applicable"}, {review_state: "superseded"}, {verifier_flags: ["scale_unverified"]}, {verifier_flags: ["scale_conflict"]}, {verifier_flags: ["entity_mismatch"]}, {verifier_flags: ["period_outside_document"]}])("excludes inadmissible readings %j", extra => {
    expect(validator([source("3000000", {raw_value: "R$ 3 milhões", source_anchor: {quote: "Montante R$ 3 milhões"}, ...extra})])(narrative("R$ 3 milhões"))).toMatchObject({accepted: false});
  });
  it("keeps days, months, percentages and multiples distinct", () => {
    const validate = validator([source("120", {field_path: "transaction.desired_term_months", unit: "days", currency: null}), source("0.15", {unit: "percent", currency: null}), source("2.5", {unit: "ratio", currency: null})]);
    expect(validate(narrative("Prazo de 120 dias, participação de 15% e índice informado de 2,5x."))).toEqual({accepted: true});
    for (const text of ["Prazo de 4 meses", "Prazo de 120 meses", "Prazo de 120 dias úteis", "Participação de 120%", "Índice de 15x"]) expect(validate(narrative(text))).toMatchObject({accepted: false});
  });
  it("accepts only explicit declared figures or anchored literal amounts when normalized currency is absent", () => {
    expect(validator([source("3000000", {currency: null})])(narrative("R$ 3 milhões"))).toMatchObject({accepted: false});
    expect(validator([source("3000000", {currency: null, raw_value: "R$ 3 milhões"})])(narrative("R$ 3 milhões"))).toEqual({accepted: true});
    expect(validator([], {declaredAmount: "3000000", declaredCurrency: "BRL", userTexts: ["Prazo de 120 dias."]})(narrative("Pedido de R$ 3 milhões por 120 dias."))).toEqual({accepted: true});
  });
  it("requires a public number in the snippet of its cited URL", () => {
    const validate = validator([source("9000000")], {publicSources: [{url: "https://example.com/a", snippet: "Investimento de R$ 2 milhões."}, {url: "https://example.com/b", snippet: "Investimento de R$ 9 milhões."}]});
    const publicClaim = (claim: string, sourceUrls = ["https://example.com/a"]) => ({...narrative("Contexto público."), researchSignals: [{claim, sourceUrls}]});
    expect(validate(publicClaim("Investimento de R$ 2 milhões."))).toEqual({accepted: true});
    expect(validate(publicClaim("Investimento de R$ 9 milhões."))).toMatchObject({accepted: false});
    expect(validate(publicClaim("Investimento de R$ 2 milhões.", ["https://example.com/unknown"]))).toMatchObject({accepted: false});
  });
  it("checks open questions as well as summaries, without mutating frozen output", () => {
    const output = Object.freeze({...narrative("Contexto da companhia."), openPoints: Object.freeze([Object.freeze({question: "Por que a diferença é de R$ 1 milhão?", whyItMatters: "Afeta o próximo pedido."})])});
    const snapshot = JSON.stringify(output);
    expect(validator([])(output)).toMatchObject({accepted: false, issues: [{path: "openPoints.0.question"}]});
    expect(JSON.stringify(output)).toBe(snapshot);
  });
  it("handles English presentation without treating years, names or a bare currency code as figures", () => {
    const validate = validator([source("3000000"), source("120", {unit: "days", currency: null})], {locale: "en"});
    expect(validate(narrative("3M, 2025: BRL. Request of BRL 3 million for 120 days."))).toEqual({accepted: true});
    expect(validate(narrative("BRL 3,000,000.00"))).toEqual({accepted: true});
    expect(validate(narrative("BRL 1 million"))).toMatchObject({accepted: false});
  });
  it("distinguishes an ambiguous presentation from a readable unsupported amount without leaking values", () => {
    const validate = validator([source("3000000", {currency: "USD"})], {locale: "en"});
    expect(validate(narrative("$ 3,000,000"))).toMatchObject({accepted: false, issues: [{code: "preliminary_figure_presentation_unresolved"}]});
    expect(validate(narrative("USD 1 million"))).toMatchObject({accepted: false, issues: [{code: "preliminary_figure_not_supported"}]});
    expect(validate(narrative("USD 3 million"))).toEqual({accepted: true});
  });
  it("corrects a refused financial narrative once through the real structured gateway rail", async () => {
    const validate = validator([source("8800000"), source("7800000")]);
    let sends = 0;
    const gateway = createModelGateway({budget: {maxCalls: 2, maxCostUsd: 0.9}, adapters: {anthropic: {provider: "anthropic", complete: async request => {
      sends++; expect(request.outputMode).toBe("structured");
      const output = {text: sends === 1 ? "A diferença é de R$ 1 milhão." : "As duas bases de dívida são comparáveis?"};
      return {output, rawText: JSON.stringify(output), usage: {inputTokens: 10, outputTokens: 10, cachedInputTokens: 0}, model: "claude-sonnet-5", stopReason: "end"};
    }}}});
    const result = await gateway.complete({task: "preliminary_understanding", system: "Use apenas valores fornecidos, sem calcular diferenças.", input: [{type: "text", text: "Fontes sintéticas."}], schema: z.object({text: z.string()}), schemaName: "synthetic_preliminary", outputMode: "structured", allowFallback: false, allowDeterministicRepair: true, maxOutputTokens: 100, validateOutput: output => validate(narrative(output.text))});
    expect(result.output.text).toBe("As duas bases de dívida são comparáveis?");expect(sends).toBe(2);
    expect(result).toMatchObject({isSameModelRepair: true, usedProviderFallback: false});
  });
});
