import {describe, expect, it} from "vitest";
import {z} from "zod";
import {estimateRequestInputTokens, estimateTextTokens, REQUEST_OVERHEAD_TOKENS, textComposition} from "./token-estimate";
import {buildAnthropicParams} from "./adapters/anthropic";
import type {AdapterRequest} from "./types";

const request: AdapterRequest = {model: "claude-opus-5", effort: "high", system: "Instruções estáveis.", input: [{type: "text", text: "Dívida bruta de R$ 5.670.186 mil."}],
  schema: z.object({deliverable: z.string().min(1)}), schemaName: "deliverable", maxOutputTokens: 1_000, timeoutMs: 1};

describe("calibrated input-token estimate", () => {
  it("counts ASCII digits and punctuation apart from every other UTF-8 byte", () => {
    expect(textComposition("R$ 5.670,1 mil; ação.")).toEqual({bytes: 23, dense: 10});
    expect(estimateTextTokens("anthropic", "abcd")).toBe(2);
    expect(estimateTextTokens("openai", "abcd")).toBe(1);
    expect(estimateTextTokens("anthropic", "1.234")).toBe(5);
    // Never above one token per byte.
    for (const text of ["界界界", "\n\n\n", "{\"a\":1}", "ação"]) expect(estimateTextTokens("anthropic", text)).toBeLessThanOrEqual(Buffer.byteLength(text));
  });

  it("reads the whole Anthropic payload and writes to the cache only up to the system breakpoint", () => {
    const estimate = estimateRequestInputTokens("anthropic", request);
    const params = buildAnthropicParams(request);
    const system = params.system as Array<{text: string}>;
    const units = (text: string) => { const {bytes, dense} = textComposition(text); return dense + (bytes - dense) * 0.45; };
    const schemaUnits = units(JSON.stringify(params.output_config!.format));
    expect(estimate.inputTokens).toBe(Math.ceil(units(system[0]!.text) + schemaUnits + units(request.input[0]!.type === "text" ? request.input[0]!.text : "") + REQUEST_OVERHEAD_TOKENS));
    expect(estimate.cacheWritableInputTokens).toBe(Math.ceil(units(system[0]!.text) + schemaUnits + REQUEST_OVERHEAD_TOKENS));
    expect(estimate.unestimatedParts).toBe(0);
  });

  it("counts the prompted-JSON instruction and the repair guidance, which travel in the system", () => {
    const structured = estimateRequestInputTokens("anthropic", request).inputTokens;
    expect(estimateRequestInputTokens("anthropic", {...request, outputMode: "prompted_json"}).inputTokens).toBeGreaterThan(structured);
    expect(estimateRequestInputTokens("anthropic", {...request, system: `${request.system}\n\nRepair: ${"x".repeat(1000)}`}).inputTokens).toBeGreaterThan(structured + 400);
  });

  it("lets OpenAI's implicit caching write the whole prompt and reads instructions, parts and the strict schema", () => {
    const openai = {...request, model: "gpt-5.6-sol"};
    const estimate = estimateRequestInputTokens("openai", openai);
    expect(estimate.cacheWritableInputTokens).toBe(estimate.inputTokens);
    expect(estimate.inputTokens).toBeGreaterThan(REQUEST_OVERHEAD_TOKENS + estimateTextTokens("openai", "Dívida bruta de R$ 5.670.186 mil."));
    expect(estimate.inputTokens).toBeLessThan(estimateRequestInputTokens("anthropic", request).inputTokens);
  });

  it("names the parts it cannot bound, which only the text estimate leaves out", () => {
    const withPdf: AdapterRequest = {...request, input: [...request.input, {type: "pdf", base64: "JVBERi0xLjQK"}, {type: "image", mediaType: "image/png", base64: "iVBORw0KGgo="}]};
    expect(estimateRequestInputTokens("anthropic", withPdf).unestimatedParts).toBe(2);
    expect(estimateRequestInputTokens("openai", {...withPdf, model: "gpt-5.6-terra"}).unestimatedParts).toBe(2);
    expect(estimateRequestInputTokens("anthropic", withPdf).inputTokens).toBe(estimateRequestInputTokens("anthropic", request).inputTokens);
  });
});
