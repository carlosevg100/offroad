import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {z} from "zod";
import {conservativeTextReservationUsd} from "./conservative-reservation";
import {createModelGateway} from "./gateway";
import {COST_RESERVATION_SAFETY_FACTOR, effectivePrice, estimateCostUsd, listPrices, reservationForTokensUsd} from "./pricing";
import {inputTokenRates, REQUEST_OVERHEAD_TOKENS} from "./token-estimate";
import type {AdapterRequest, AdapterResponse, GatewayRequest, Provider, ProviderAdapter} from "./types";

/**
 * The reservation production jobs charge is the calibrated upper bound (the gateway has no other
 * rule), so it must bound the bill of every real request the repository holds, and a request whose
 * bound does not fit the remaining ceiling must be refused before anything is sent.
 */
type Sample = {
  id: string; provider: Provider; model: string; realInputTokens: number; denseCharacters: number; otherBytes: number;
  requestMaxOutputTokens: number; billedUsage: {outputTokens: number; cachedInputTokens: number; cacheCreationInputTokens: number};
};
const calibration = JSON.parse(readFileSync(new URL("./reservation-calibration.json", import.meta.url), "utf8")) as {samples: Sample[]};

/** The gateway's input estimate of a request of this composition: the rule of `token-estimate.ts`. */
const estimatedInput = (sample: Sample) => {
  const rate = inputTokenRates[sample.provider];
  return Math.ceil(sample.denseCharacters * rate.perDenseCharacter + sample.otherBytes * rate.perOtherByte) + REQUEST_OVERHEAD_TOKENS;
};
const bill = (sample: Sample) => estimateCostUsd(sample.model, {inputTokens: sample.realInputTokens, ...sample.billedUsage});

describe("production reservation against real bills", () => {
  it("is never below the bill of any calibration sample, even before its price margin", () => {
    expect(calibration.samples.length).toBeGreaterThanOrEqual(13);
    for (const sample of calibration.samples) {
      // The composition fixes the estimate, not which of its tokens sit before the cache
      // breakpoint. Pricing every token at the input rate is therefore the smallest reservation
      // the gateway can charge for the request: cache-writable tokens cost the write rate, which
      // is never below it. If that smallest reservation bounds the bill, the real one does.
      const smallest = reservationForTokensUsd({model: sample.model, inputTokens: estimatedInput(sample), cacheWritableInputTokens: 0,
        maxOutputTokens: sample.requestMaxOutputTokens});
      expect(sample.billedUsage.outputTokens, sample.id).toBeLessThanOrEqual(sample.requestMaxOutputTokens);
      expect(smallest / COST_RESERVATION_SAFETY_FACTOR, sample.id).toBeGreaterThanOrEqual(bill(sample));
    }
  });

  it("bounds the input side of every bill on its own, with cache reads and writes as billed", () => {
    // Stronger than the whole reservation, whose output ceiling alone covers most small requests:
    // the estimated input at the plain input rate is already at least the billed input.
    for (const sample of calibration.samples) {
      const rates = effectivePrice(listPrices[sample.model]!, sample.realInputTokens);
      const {cachedInputTokens, cacheCreationInputTokens} = sample.billedUsage;
      const billedInputUsd = ((sample.realInputTokens - cachedInputTokens - cacheCreationInputTokens) * rates.input
        + cacheCreationInputTokens * rates.cacheWrite + cachedInputTokens * rates.cachedInput) / 1_000_000;
      expect(estimatedInput(sample) * effectivePrice(listPrices[sample.model]!, estimatedInput(sample)).input / 1_000_000, sample.id)
        .toBeGreaterThanOrEqual(billedInputUsd);
    }
  });
});

const schema = z.object({ok: z.boolean()});
const request: GatewayRequest<typeof schema> = {task: "extract_fields", schema, schemaName: "probe",
  // Stable instructions the former four-characters estimate never read, and Portuguese evidence
  // it read at a quarter of a token per character.
  system: "Extraia somente o que estiver escrito, com a âncora exata de cada fato.\n".repeat(400),
  input: [{type: "text", text: "Receita líquida consolidada de R$ 5.670.186 mil no 1T26, dívida bruta de R$ 6,1 bilhões.\n".repeat(300)}]};

function adapter(provider: Provider, outputs: Array<unknown | Error> = [{ok: true}]) {
  const calls: AdapterRequest[] = [];
  const implementation: ProviderAdapter = {provider, async complete(input) {
    calls.push(input);
    const output = outputs.shift();
    if (output instanceof Error) throw output;
    return {output, model: input.model, rawText: JSON.stringify(output), usage: {inputTokens: 10, outputTokens: 10, cachedInputTokens: 0}, stopReason: "end"} as AdapterResponse;
  }};
  return {calls, implementation};
}

/** What the production gateway charges for the first attempt of `request` on its primary route. */
async function primaryReservation(): Promise<{reservationUsd: number; sent: AdapterRequest}> {
  const probe = adapter("anthropic");
  const gateway = createModelGateway({adapters: {anthropic: probe.implementation}, budget: {maxCostUsd: 100, maxCalls: 1}});
  await gateway.complete({...request, allowFallback: false});
  const sent = probe.calls[0]!;
  return {reservationUsd: conservativeTextReservationUsd("anthropic", sent, listPrices), sent};
}

describe("production reservation before any send", () => {
  it("charges the calibrated bound of the whole payload, far above the text-only estimate it replaces", async () => {
    const {reservationUsd, sent} = await primaryReservation();
    const price = listPrices[sent.model]!;
    const textOnly = (Math.ceil(sent.input.reduce((total, part) => total + (part.type === "text" ? part.text.length : 0), 0) / 4) * price.input
      + sent.maxOutputTokens * price.output) / 1_000_000 * COST_RESERVATION_SAFETY_FACTOR;
    expect(reservationUsd).toBeGreaterThan(textOnly * 1.3);
  });

  it("refuses a request whose bound exceeds the ceiling, on the primary and before the fallback, and sends nothing", async () => {
    const {reservationUsd} = await primaryReservation();
    const primary = adapter("anthropic"), fallback = adapter("openai");
    const tight = createModelGateway({adapters: {anthropic: primary.implementation, openai: fallback.implementation},
      budget: {maxCostUsd: reservationUsd - 0.000_001, maxCalls: 8}});
    await expect(tight.complete(request)).rejects.toMatchObject({code: "budget_exceeded"});
    expect(primary.calls).toHaveLength(0);
    expect(fallback.calls).toHaveLength(0);
    expect(tight.spent()).toMatchObject({calls: 0, costUsd: 0, budgetExposureUsd: 0});

    // The same ceiling admits the request at its exact bound.
    const exact = createModelGateway({adapters: {anthropic: adapter("anthropic").implementation}, budget: {maxCostUsd: reservationUsd, maxCalls: 8}});
    await expect(exact.complete({...request, allowFallback: false})).resolves.toMatchObject({provider: "anthropic"});

    // A primary whose outcome is unknown keeps its whole bound; a fallback that no longer fits
    // under the ceiling is refused before it is sent.
    const failing = adapter("anthropic", [new Error("provider outcome unknown")]), unaffordable = adapter("openai");
    const shared = createModelGateway({adapters: {anthropic: failing.implementation, openai: unaffordable.implementation},
      budget: {maxCostUsd: reservationUsd * 1.5, maxCalls: 8}});
    await expect(shared.complete(request)).rejects.toMatchObject({code: "budget_exceeded"});
    expect(failing.calls).toHaveLength(1);
    expect(unaffordable.calls).toHaveLength(0);
    expect(shared.spent().budgetExposureUsd).toBeCloseTo(reservationUsd, 9);
  });
});
