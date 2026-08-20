/**
 * @offroad/credit-playbook — what the desk knows, as data.
 *
 * Deal archetypes with the information they require (minimum to open a case, ideal to price
 * it), what to read first and why, how each kind of operation usually goes wrong, and the
 * shape the paper takes. Pure data and pure functions: no I/O, no model, no credit decision.
 *
 * Validated by the founder, an ex-investment banker — which is the only reason it is allowed
 * to exist. A playbook nobody with a desk behind them has read is one agent's opinion.
 */
export const creditPlaybookVersion = "2026.08.20-v1";

export * from "./types";
export * from "./archetypes";
export * from "./sufficiency";
