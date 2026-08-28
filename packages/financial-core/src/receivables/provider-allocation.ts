import Decimal from "decimal.js";

export const receivablesProviderAllocationFormula = {
  id: "receivables_provider_allocation_envelope",
  version: "2026.08.27-v1",
} as const;

export type ReceivablesProviderAllocationInput = {
  requestedAmount: string;
  ticketMinimum: string;
  ticketMaximum: string;
  availableCapacity: string;
  eligiblePortfolioAmount: string;
  conditionalPortfolioAmount: string;
};

export type ReceivablesProviderAllocationEnvelope = {
  formula: typeof receivablesProviderAllocationFormula;
  maximumConfirmedAllocation: string;
  maximumAllocationIncludingConditional: string;
  minimumTicketMet: boolean;
  minimumTicketMetIncludingConditional: boolean;
  wholeRequestCovered: boolean;
};

function nonNegative(value: string, label: string): Decimal {
  const parsed = new Decimal(value);
  if (!parsed.isFinite() || parsed.isNegative()) throw new RangeError(`${label} must be a non-negative decimal`);
  return parsed;
}

function minimum(values: readonly Decimal[]): Decimal {
  return values.reduce((result, value) => Decimal.min(result, value));
}

export function calculateReceivablesProviderAllocation(
  input: ReceivablesProviderAllocationInput,
): ReceivablesProviderAllocationEnvelope {
  const requested = nonNegative(input.requestedAmount, "requestedAmount");
  const ticketMinimum = nonNegative(input.ticketMinimum, "ticketMinimum");
  const ticketMaximum = nonNegative(input.ticketMaximum, "ticketMaximum");
  const availableCapacity = nonNegative(input.availableCapacity, "availableCapacity");
  const eligible = nonNegative(input.eligiblePortfolioAmount, "eligiblePortfolioAmount");
  const conditional = nonNegative(input.conditionalPortfolioAmount, "conditionalPortfolioAmount");
  if (ticketMaximum.lt(ticketMinimum)) throw new RangeError("ticketMaximum must be greater than or equal to ticketMinimum");
  const maximumConfirmed = minimum([requested, ticketMaximum, availableCapacity, eligible]);
  const maximumIncludingConditional = minimum([requested, ticketMaximum, availableCapacity, eligible.plus(conditional)]);
  return {
    formula: receivablesProviderAllocationFormula,
    maximumConfirmedAllocation: maximumConfirmed.toFixed(2),
    maximumAllocationIncludingConditional: maximumIncludingConditional.toFixed(2),
    minimumTicketMet: maximumConfirmed.gte(ticketMinimum),
    minimumTicketMetIncludingConditional: maximumIncludingConditional.gte(ticketMinimum),
    wholeRequestCovered: maximumConfirmed.gte(requested),
  };
}
