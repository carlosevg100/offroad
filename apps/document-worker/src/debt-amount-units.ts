const SCALE = /(?:\bmil\b|milhar(?:es)?|milh(?:ão|ões|ao|oes)|bilh(?:ão|ões|ao|oes)|trilh(?:ão|ões|ao|oes)|\b(?:k|mi|mn|mm|bn|bi|billion|million|thousand)\b)/iu;
const FULL_MAGNITUDE = /(?:^|\D)(?:\d{1,3}(?:[.,\s]\d{3})+|\d{4,})(?:[.,]\d{1,2})?(?:\D|$)/u;

/** A debt amount must preserve its source scale. A bare `R$ 650` or `R$ 1,25` is materially
 * ambiguous in a DCM readout and must be represented as null until the source scale is proven. */
export function ambiguousDebtAmount(amount: string | null): boolean {
  if (amount === null) return false;
  const normalized = amount.trim();
  if (!/\d/u.test(normalized)) return true;
  return !SCALE.test(normalized) && !FULL_MAGNITUDE.test(normalized);
}
