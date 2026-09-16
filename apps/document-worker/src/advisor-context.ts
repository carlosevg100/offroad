import {z} from "zod";

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

/**
 * The active methodology of the organization, as the loader delivers it. Its content is
 * validated against `organizationMethodologySchema` where it is consumed; here it only has to
 * be an object with a version, so a malformed row cannot take the whole context down.
 */
export const organizationMethodologySchema = z.object({
  version: z.number().int().min(1),
  content: z.record(z.string(), z.unknown()),
  sourceKind: z.enum(["house_default", "self_declared", "reviewed"]),
  confirmedAt: z.string().nullable(),
});
