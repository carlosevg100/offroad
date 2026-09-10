import {Buffer} from "node:buffer";
import {z} from "zod";
import {buildAnthropicParams} from "./adapters/anthropic";
import {buildOpenAIParams} from "./adapters/openai";
import {estimateCostReservationUsd, type ModelPrice} from "./pricing";
import {ModelGatewayError, type AdapterRequest, type Provider} from "./types";

/** Opt-in textual evaluation bound; list-price exposure, not a provider billing guarantee. */
export function conservativeTextReservationUsd(provider: Provider, request: AdapterRequest, prices: Record<string, ModelPrice>): number {
  const price = Object.hasOwn(prices, request.model) ? prices[request.model] : undefined;
  if (!price || !Number.isFinite(price.input) || price.input <= 0 || !Number.isFinite(price.output) || price.output <= 0
    || !Number.isFinite(price.cachedInput) || price.cachedInput < 0
    || !Number.isSafeInteger(request.maxOutputTokens) || request.maxOutputTokens <= 0
    || request.input.some(part => part.type !== "text")) {
    throw new ModelGatewayError("conservative textual reservation requires bounded text and known positive prices", "budget_exceeded");
  }
  // Count the actual adapter payload: system, schema, prompted-JSON instructions,
  // repair guidance, user parts, role framing and provider-specific transformations.
  const payload = provider === "anthropic" ? buildAnthropicParams(request) : buildOpenAIParams(request);
  // Also retain the original schema as a conservative allowance for grammar framing.
  // One token per UTF-8 byte avoids chars/4 undercounting multilingual/escaped text.
  // An extra 2048-token allowance covers hidden protocol framing; output uses its full cap.
  const inputTokens = Buffer.byteLength(JSON.stringify(payload), "utf8")
    + Buffer.byteLength(JSON.stringify(z.toJSONSchema(request.schema)), "utf8") + 2048;
  // Anthropic's current ephemeral cache may write all input at the 5-minute 1.25x tariff.
  const reservationPrices = provider === "anthropic" ? {...prices, [request.model]: {...price, input: price.input * 1.25}} : prices;
  const reservation = estimateCostReservationUsd(request.model, inputTokens, request.maxOutputTokens, reservationPrices);
  if (!Number.isFinite(reservation) || reservation <= 0) throw new ModelGatewayError("invalid conservative reservation", "budget_exceeded");
  return reservation;
}
