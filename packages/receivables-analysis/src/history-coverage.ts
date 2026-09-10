import {z} from "zod";
import type {ReceivablesAnalysis} from "./analyze";

const familySchema = z.object({
  id: z.enum(["roll_rates", "vintages", "dilution", "repurchase_and_loss", "punctual_settlement", "extensions"]),
  status: z.enum(["measured", "partial", "not_evaluable"]),
  basis: z.string().min(1),
  unavailableMetricIds: z.array(z.string()),
  warnings: z.array(z.string()),
}).strict();
export const receivablesHistoryCoverageSchema = z.object({
  schemaVersion: z.literal("receivables-history-coverage.v1"),
  aggregatePerformanceBasis: z.literal("reported_title_aggregates"),
  families: z.array(familySchema).length(6),
  warnings: z.array(z.string()),
}).strict();
export const receivablesEconomicConventionsSchema = z.object({
  concentrationDenominator: z.literal("preliminary_eligible_balance"),
  concentrationOrder: z.tuple([z.literal("debtor"), z.literal("economic_group")]),
  waterfallOrder: z.tuple([z.literal("servicing_fee"), z.literal("senior_interest"), z.literal("reserve_top_up"), z.literal("senior_principal"), z.literal("mezzanine"), z.literal("subordinated_residual")]),
}).strict();
export const receivablesEconomicConventions = receivablesEconomicConventionsSchema.parse({
  concentrationDenominator: "preliminary_eligible_balance",
  concentrationOrder: ["debtor", "economic_group"],
  waterfallOrder: ["servicing_fee", "senior_interest", "reserve_top_up", "senior_principal", "mezzanine", "subordinated_residual"],
});

/** Projects engine coverage only; does not synthesize financial values or missing events. */
export function buildReceivablesHistoryCoverage(metrics: ReceivablesAnalysis["dynamicMetrics"]): z.infer<typeof receivablesHistoryCoverageSchema> {
  const definitions = [
    ["roll_rates", metrics.rollRates, metrics.rollRates.basis],
    ["vintages", metrics.vintages, metrics.vintages.basis],
    ["dilution", metrics.dilution, "governed_event_history"],
    ["repurchase_and_loss", metrics.repurchaseAndLoss, "governed_event_history"],
    ["punctual_settlement", metrics.punctualSettlement, "governed_event_history"],
    ["extensions", metrics.extensions, "governed_event_history"],
  ] as const;
  const families = definitions.map(([id, value, basis]) => {
    const statuses: string[] = [];
    let unavailableContext = false;
    const warnings = new Set<string>();
    const unavailable = new Set<string>();
    const visit = (node: unknown): void => {
      if (Array.isArray(node)) { for (const child of node) visit(child); return; }
      if (node === null || typeof node !== "object") return;
      const record = node as Record<string, unknown>;
      if (record.status === "measured" || record.status === "not_evaluable") {
        if (typeof record.id === "string") {
          statuses.push(record.status);
          if (record.status === "not_evaluable") unavailable.add(record.id);
        } else if (record.status === "not_evaluable") {
          unavailableContext = true;
        }
      }
      if (Array.isArray(record.warnings)) for (const warning of record.warnings) if (typeof warning === "string") warnings.add(warning);
      for (const child of Object.values(record)) visit(child);
    };
    visit(value);
    const measured = statuses.includes("measured");
    const missing = statuses.includes("not_evaluable");
    return {id, basis, status: measured ? missing || unavailableContext ? "partial" as const : "measured" as const : "not_evaluable" as const,
      unavailableMetricIds: [...unavailable].sort(), warnings: [...warnings].sort()};
  });
  return receivablesHistoryCoverageSchema.parse({schemaVersion: "receivables-history-coverage.v1", aggregatePerformanceBasis: "reported_title_aggregates", families, warnings: [...metrics.quality.warnings].sort()});
}
