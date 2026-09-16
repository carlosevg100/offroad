import {describe, expect, it, vi} from "vitest";
import {verifiedCompanyMemorySubject} from "./public-company-memory";
import type {CapitalProjectAnalysisJob, QueueClient} from "./queue";
const job = {job_id: "a5550000-0000-4000-9000-000000000001", capability_token: "synthetic"} as CapitalProjectAnalysisJob;
const identity = {legalName: "Synthetic Company", verifiedEntityId: "a5550000-0000-4000-9000-000000000003"};
describe("capability-bound public identity adapter", () => {
  it("uses only the database-proven identity and preserves the job capability", async () => {
    const loadPublicCompanyIdentity = vi.fn(async () => identity);
    const result = await verifiedCompanyMemorySubject({loadPublicCompanyIdentity} as unknown as QueueClient, job, {legalName: " SYNTHETIC COMPANY ", geography: "Private input must not enter shared identity"});
    expect(loadPublicCompanyIdentity).toHaveBeenCalledWith(job);
    expect(result).toEqual(identity);
  });
  it("continues without shared identity for unresolved or mismatched subjects", async () => {
    expect(await verifiedCompanyMemorySubject({} as QueueClient, job, {legalName: "Synthetic Company"})).toBeUndefined();
    expect(await verifiedCompanyMemorySubject({loadPublicCompanyIdentity: async () => null} as unknown as QueueClient, job, {legalName: "Synthetic Company"})).toBeUndefined();
    expect(await verifiedCompanyMemorySubject({loadPublicCompanyIdentity: async () => identity} as unknown as QueueClient, job, {legalName: "Different Company"})).toBeUndefined();
  });
  it("does not turn revoked job authority into a name-keyed fallback", async () => {
    await expect(verifiedCompanyMemorySubject({loadPublicCompanyIdentity: async () => {throw new Error("job_authority_revoked");}} as unknown as QueueClient, job, {legalName: "Synthetic Company"})).rejects.toThrow("job_authority_revoked");
  });
});
