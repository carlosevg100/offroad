import {reservationForTokensUsd, type ModelPrice} from "./pricing";
import {estimateRequestInputTokens} from "./token-estimate";
import {ModelGatewayError, type AdapterRequest, type Provider} from "./types";

/**
 * The reservation of every attempt the gateway makes, production jobs and governed evaluations
 * alike: list-price exposure, not a provider billing guarantee.
 *
 * The input is the calibrated upper bound of the complete adapter payload (`token-estimate.ts`:
 * dense characters at one token each, other bytes at the provider's measured rate with its
 * margin, plus the hidden framing allowance). The tokens the provider may write to its prompt
 * cache are charged at the model's cache-write rate, the rest at the input rate; the output is
 * the whole ceiling the request allows. The long-context tariff applies when the estimated input
 * passes the model's threshold; since the estimate bounds the real count from above, a request
 * below the threshold by the estimate is below it in fact. The result carries the 10% price
 * margin of every reservation.
 *
 * It fails closed, with `budget_exceeded` before anything is sent, on a model without a complete
 * price and on image or PDF parts, which the text rule cannot bound. No production path sends
 * either: every allowlisted route is priced and every production input is text.
 */
export function conservativeTextReservationUsd(provider: Provider, request: AdapterRequest, prices: Record<string, ModelPrice>): number {
  const price = Object.hasOwn(prices, request.model) ? prices[request.model] : undefined;
  if (!price || !Number.isFinite(price.input) || price.input <= 0 || !Number.isFinite(price.output) || price.output <= 0
    || !Number.isFinite(price.cachedInput) || price.cachedInput < 0
    || !Number.isFinite(price.cacheWrite) || price.cacheWrite < price.input
    || (price.longContext !== null && !(price.longContext.aboveInputTokens > 0 && price.longContext.inputMultiplier >= 1 && price.longContext.outputMultiplier >= 1))
    || !Number.isSafeInteger(request.maxOutputTokens) || request.maxOutputTokens <= 0
    || request.input.some(part => part.type !== "text")) {
    throw new ModelGatewayError("conservative textual reservation requires bounded text and known positive prices", "budget_exceeded");
  }
  const estimate = estimateRequestInputTokens(provider, request);
  const reservation = reservationForTokensUsd({
    model: request.model,
    inputTokens: estimate.inputTokens,
    cacheWritableInputTokens: estimate.cacheWritableInputTokens,
    maxOutputTokens: request.maxOutputTokens,
    prices,
  });
  if (!Number.isFinite(reservation) || reservation <= 0) throw new ModelGatewayError("invalid conservative reservation", "budget_exceeded");
  return reservation;
}
