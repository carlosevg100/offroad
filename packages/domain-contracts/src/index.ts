import {z} from "zod";

export const localeSchema = z.enum(["pt-BR", "en-US"]);
export const currencySchema = z.string().regex(/^[A-Z]{3}$/);
export const decimalStringSchema = z.string().regex(/^-?\d+(?:\.\d+)?$/);
export const uuidSchema = z.uuid();

export const taskEnvelopeSchema = z.object({
  taskId: uuidSchema,
  organizationId: uuidSchema,
  opportunityId: uuidSchema.optional(),
  actorUserId: uuidSchema,
  locale: localeSchema,
  purpose: z.string().min(3).max(200),
  permittedEvidenceScopes: z.array(z.string()).max(50),
  allowedTools: z.array(z.string()).max(30),
  inputVersion: z.string().min(1),
  outputSchemaVersion: z.string().min(1),
  budget: z.object({
    maxToolCalls: z.number().int().positive().max(100),
    maxTokens: z.number().int().positive(),
    deadline: z.iso.datetime(),
  }),
});

export const sourceAnchorSchema = z.object({
  sourceDocumentId: uuidSchema,
  version: z.number().int().positive(),
  page: z.number().int().positive().optional(),
  sheet: z.string().optional(),
  cellRange: z.string().optional(),
  quoteHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});

export const claimSchema = z.object({
  id: uuidSchema,
  kind: z.enum(["fact", "calculation", "judgment", "public_source"]),
  material: z.boolean(),
  text: z.string().min(1),
  supportIds: z.array(uuidSchema),
  approved: z.boolean().default(false),
});

export const scenarioTermsSchema = z.object({
  currency: currencySchema,
  amount: decimalStringSchema,
  termMonths: z.number().int().min(1).max(360),
  amortizationMonths: z.number().int().min(0).max(360),
  annualCashRate: decimalStringSchema,
  upfrontFeeRate: decimalStringSchema,
  structure: z.enum(["senior_secured", "unitranche", "receivables", "asset_backed", "mezzanine"]),
  collateralTypes: z.array(z.string()),
  minimumDscr: decimalStringSchema,
});

export const opportunityProjectionSchema = z.object({
  id: uuidSchema,
  sector: z.string().min(1),
  geography: z.string().min(1),
  currency: currencySchema,
  amountMin: decimalStringSchema,
  amountMax: decimalStringSchema,
  termMonthsMin: z.number().int().positive(),
  termMonthsMax: z.number().int().positive(),
  structureTypes: z.array(z.string()),
  collateralTypes: z.array(z.string()),
});

export type TaskEnvelope = z.infer<typeof taskEnvelopeSchema>;
export type Claim = z.infer<typeof claimSchema>;
export type ScenarioTerms = z.infer<typeof scenarioTermsSchema>;
export type OpportunityProjection = z.infer<typeof opportunityProjectionSchema>;
