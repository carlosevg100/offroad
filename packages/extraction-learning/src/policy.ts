import type {Measurement} from "./accuracy";

/**
 * The fields the desk should fix next, worst first.
 *
 * Ordered by how much reviewer time each one costs — a field wrong 40% of the time across
 * eighty proposals is a bigger problem than one wrong every time across three, and a list
 * sorted purely by accuracy would put them the other way round.
 */
export function worstOffenders(measurements: readonly Measurement[], limit = 10): Measurement[] {
  return [...measurements]
    .filter((measurement) => measurement.judged > 0 && measurement.accepted < measurement.judged)
    .sort((a, b) => (b.edited + b.rejected) - (a.edited + a.rejected) || a.lowerBound - b.lowerBound)
    .slice(0, limit);
}
