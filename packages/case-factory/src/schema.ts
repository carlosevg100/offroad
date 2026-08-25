import {z} from "zod";
import {archetypeIdSchema} from "@offroad/credit-playbook";
import {informationClassSchema} from "@offroad/credit-ontology";
import {collateralKindSchema, instrumentSchema} from "@offroad/fund-mandate";

const moneySchema = z.string().regex(/^-?\d+(?:\.\d+)?$/);

export const factoryPerturbationSchema = z.discriminatedUnion("kind", [
  z.object({kind: z.literal("format"), document: z.string(), mode: z.enum(["decimal_comma", "semicolon_csv", "shuffled_rows", "scanned_image"])}),
  z.object({kind: z.literal("evidence"), fieldPath: z.string(), mode: z.enum(["missing_anchor", "weak_source", "omitted"])}),
  z.object({
    kind: z.literal("conflict"),
    fieldPath: z.string(),
    alternateValue: z.string(),
    sourceDocument: z.string(),
    informationClass: informationClassSchema.default("management"),
    evidenceRank: z.number().int().min(1).max(7).default(5),
    periodEnd: z.iso.date().optional(),
  }),
  z.object({kind: z.literal("security"), document: z.string(), mode: z.enum(["prompt_injection", "formula_injection", "cross_tenant_reference", "hidden_instruction"])}),
]);
export type FactoryPerturbation = z.infer<typeof factoryPerturbationSchema>;

export const factoryScenarioSchema = z.object({
  schemaVersion: z.literal("2026.08.24-v1"),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{2,79}$/),
  seed: z.number().int().nonnegative(),
  locale: z.enum(["pt", "en"]),
  archetypeId: archetypeIdSchema,
  referenceDate: z.iso.date(),
  company: z.object({
    legalName: z.string().min(3),
    legalForm: z.enum(["sa", "ltda"]),
    sector: z.string().min(2),
    state: z.string().length(2),
    currency: z.literal("BRL").default("BRL"),
  }),
  historical: z.array(z.object({
    periodEnd: z.iso.date(),
    revenue: moneySchema,
    ebitda: moneySchema,
    netIncome: moneySchema,
    cash: moneySchema,
    grossDebt: moneySchema,
    receivables: moneySchema,
    inventory: moneySchema,
    payables: moneySchema,
  })).min(3),
  debt: z.array(z.object({
    lender: z.string().min(2),
    instrument: z.string().min(2),
    outstanding: moneySchema,
    maturity: z.iso.date(),
    collateral: z.string().nullable().default(null),
  })).min(1),
  request: z.object({
    amount: moneySchema,
    purpose: z.string().min(5),
    termMonths: z.number().int().positive(),
    graceMonths: z.number().int().nonnegative(),
    projectCost: moneySchema,
    useOfProceeds: z.array(z.object({item: z.string().min(2), amount: moneySchema})).min(1),
  }),
  collateral: z.object({
    receivables: moneySchema.default("0"),
    inventory: moneySchema.default("0"),
    equipment: moneySchema.default("0"),
    realEstate: moneySchema.default("0"),
  }),
  loanTape: z.object({
    receivables: z.number().int().min(10).max(5000),
    totalBalance: moneySchema,
    overdueBalanceShare: z.number().min(0).max(0.9),
    topDebtorBalanceShare: z.number().positive().max(0.9),
  }).superRefine((tape, context) => {
    if (tape.overdueBalanceShare + tape.topDebtorBalanceShare > 0.95) {
      context.addIssue({code: "custom", message: "overdue and top-debtor balance shares must leave room for the remaining portfolio"});
    }
    const minimumTopShare = (1 - tape.overdueBalanceShare) / (tape.receivables - 1);
    if (tape.topDebtorBalanceShare < minimumTopShare) {
      context.addIssue({code: "custom", path: ["topDebtorBalanceShare"], message: "declared top debtor must remain the largest debtor after generation"});
    }
  }).optional(),
  mandates: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(2),
    minTicket: moneySchema,
    maxTicket: moneySchema,
    minTermMonths: z.number().int().positive(),
    maxTermMonths: z.number().int().positive(),
    sectors: z.array(z.string()).min(1),
    instruments: z.array(instrumentSchema).min(1),
    collateral: z.array(collateralKindSchema).default([]),
    leverageCeiling: moneySchema.optional(),
  })).min(1),
  perturbations: z.array(factoryPerturbationSchema).default([]),
});
export type FactoryScenario = z.infer<typeof factoryScenarioSchema>;
