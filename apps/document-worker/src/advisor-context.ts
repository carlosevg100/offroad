import {z} from "zod";

export const professionalContextSchema = z.object({
  affiliationKind: z.string().nullable(),
  professionalRole: z.string().nullable(),
  teamName: z.string().nullable(),
  institutionName: z.string().nullable(),
  operatingModels: z.array(z.string()).max(20),
  productFamilies: z.array(z.string()).max(30),
  primaryObjectives: z.array(z.string()).max(20),
  contextNotes: z.string().nullable(),
  disclosureStatus: z.enum(["complete", "partial", "skipped"]),
  lastConfirmedAt: z.string().nullable(),
});

export const institutionCapabilitiesSchema = z.object({
  institutionName: z.string().nullable(),
  institutionKind: z.string().nullable(),
  operatingModels: z.array(z.string()).max(20),
  productFamilies: z.array(z.string()).max(30),
  geographies: z.array(z.string()).max(40),
  currencies: z.array(z.string()).max(20),
  capabilityNotes: z.string().nullable(),
  sourceKind: z.enum(["self_declared", "public_observed", "mixed", "unknown"]),
  disclosureStatus: z.enum(["complete", "partial", "skipped"]),
  lastConfirmedAt: z.string().nullable(),
});
