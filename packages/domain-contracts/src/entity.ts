import {z} from "zod";

/** Identity candidates are never authorization or an automatic merge instruction. */
export const entityCandidateSchema = z.object({
  entityId: z.uuid(),
  legalName: z.string().min(2).max(300),
  scope: z.enum(["public", "dossier"]),
  match: z.enum(["reviewed_identifier", "name_candidate"]),
  identifierId: z.uuid().nullable(),
}).strict().superRefine((value, context) => {
  if ((value.match === "reviewed_identifier") !== (value.identifierId !== null)) {
    context.addIssue({code: "custom", path: ["identifierId"], message: "Identifier matches require a reviewed identifier"});
  }
});
export const entityCandidatesSchema = z.object({
  schemaVersion: z.literal("entity-candidates.v1"),
  candidates: z.array(entityCandidateSchema).max(20),
  automaticMerge: z.literal(false),
}).strict();
export const entityIdentifierNamespaceSchema = z.enum(["BR:CNPJ", "BR:CVM", "US:CIK", "LEI", "legacy_sha256"]);
export type EntityCandidates = z.infer<typeof entityCandidatesSchema>;
