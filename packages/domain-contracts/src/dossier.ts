import {z} from "zod";

export const dossierEntityLinkSchema = z.object({
  id: z.uuid(),
  entityId: z.uuid(),
  relationship: z.enum(["subject", "parent", "subsidiary", "guarantor", "asset"]),
  perimeter: z.record(z.string(), z.unknown()),
  validFrom: z.iso.datetime({offset: true}),
  validUntil: z.iso.datetime({offset: true}).nullable(),
  reviewedBy: z.uuid(),
  withdrawnAt: z.iso.datetime({offset: true}).nullable(),
  withdrawnBy: z.uuid().nullable(),
  withdrawalReason: z.string().trim().min(5).max(2000).nullable(),
  reviewReason: z.string().trim().min(5).max(2000),
}).strict().superRefine((value, context) => {
  const withdrawalFields = [value.withdrawnAt, value.withdrawnBy, value.withdrawalReason].filter((field) => field !== null).length;
  if (withdrawalFields !== 0 && withdrawalFields !== 3) context.addIssue({code: "custom", path: ["withdrawnAt"], message: "Withdrawal requires a complete review"});
  if (value.validUntil !== null && Date.parse(value.validUntil) <= Date.parse(value.validFrom)) {
    context.addIssue({code: "custom", path: ["validUntil"], message: "The effective period must be positive"});
  }
});
/** resourceId is the existing policy boundary; an entityId never replaces it. */
export const dossierSchema = z.object({
  schemaVersion: z.literal("dossier.v1"),
  id: z.uuid(),
  organizationId: z.uuid(),
  resourceId: z.uuid(),
  legacyCompanyId: z.uuid().nullable(),
  profile: z.record(z.string(), z.unknown()),
  links: z.array(dossierEntityLinkSchema),
}).strict();
export type Dossier = z.infer<typeof dossierSchema>;
