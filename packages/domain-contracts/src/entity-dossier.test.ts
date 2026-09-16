import {describe, expect, it} from "vitest";
import {entityCandidatesSchema} from "./entity";
import {dossierSchema, dossierEntityLinkSchema} from "./dossier";
const id = "a5550000-0000-4000-9000-000000000001";
describe("entity and private dossier contracts", () => {
  it("never turns a name candidate into automatic identity or authority", () => {
    const value = {schemaVersion: "entity-candidates.v1", candidates: [{entityId: id, legalName: "Synthetic homonym", scope: "public", match: "name_candidate", identifierId: null}], automaticMerge: false};
    expect(entityCandidatesSchema.safeParse(value).success).toBe(true);
    expect(entityCandidatesSchema.safeParse({...value, automaticMerge: true}).success).toBe(false);
    expect(entityCandidatesSchema.safeParse({...value, organizationCount: 2}).success).toBe(false);
    expect(entityCandidatesSchema.safeParse({...value, candidates: [{...value.candidates[0], match: "reviewed_identifier"}]}).success).toBe(false);
  });
  it("requires dated reviewed links and a resource boundary independently of identity", () => {
    const link = {id, entityId: id, relationship: "subject", perimeter: {basis: "standalone"}, validFrom: "2026-01-01T00:00:00Z", validUntil: null, reviewedBy: id, reviewReason: "Synthetic review", withdrawnAt: null, withdrawnBy: null, withdrawalReason: null};
    expect(dossierEntityLinkSchema.safeParse(link).success).toBe(true);
    expect(dossierEntityLinkSchema.safeParse({...link, validUntil: link.validFrom}).success).toBe(false);
    expect(dossierEntityLinkSchema.safeParse({...link, reviewedBy: null}).success).toBe(false);
    const dossier = {schemaVersion: "dossier.v1", id, organizationId: id, resourceId: id, legacyCompanyId: null, profile: {}, links: [link]};
    expect(dossierSchema.safeParse(dossier).success).toBe(true);
    expect(dossierSchema.safeParse({...dossier, resourceId: null}).success).toBe(false);
  });
});
