import {z} from "zod";

/**
 * What a person said about their own work: several use forms, several roles, several practice
 * areas. It carries no capability field on purpose. What an institution is able to do is a
 * separate fact with an owner and an origin, and it arrives in institutionCapabilitiesSchema.
 */
export const professionalContextSchema = z.object({
  useForms: z.array(z.string()).max(10),
  professionalRoles: z.array(z.string()).max(20),
  practiceAreas: z.array(z.string()).max(30),
  primaryObjectives: z.array(z.string()).max(20),
  institutionName: z.string().nullable(),
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
