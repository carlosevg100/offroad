import {describe, expect, it} from "vitest";
import {evaluateRetentionDisposition, evaluateRevocationReceipts, revocationDestinations} from "./revocation";
const now = new Date("2026-10-06T12:00:00Z");
const target = (destination: typeof revocationDestinations[number]) => ({destination, state: "completed", deadlineAt: "2026-10-06T11:55:00Z", completedAt: "2026-10-06T11:54:00Z", receiptFingerprint: "a".repeat(64)});
describe("end-to-end lifecycle receipts", () => {
  it("requires receipts from all six controlled destinations", () => {
    expect(evaluateRevocationReceipts(revocationDestinations.map(target), now).completed).toBe(true);
    expect(evaluateRevocationReceipts([target("authority_outbox")], now)).toMatchObject({completed: false, missing: ["search", "cache", "jobs", "artifacts", "storage"]});
    expect(evaluateRevocationReceipts([], now).completed).toBe(false);
  });
  it("rejects a completion without evidence and duplicate destinations", () => {
    expect(() => evaluateRevocationReceipts([{...target("storage"), receiptFingerprint: null}], now)).toThrow();
    expect(() => evaluateRevocationReceipts([target("storage"), target("storage")], now)).toThrow("revocation_duplicate_destination");
  });
  it("reports overdue and blocked cleanup without granting access", () => {
    expect(evaluateRevocationReceipts([{...target("jobs"), state: "blocked", completedAt: null, receiptFingerprint: null}], now)).toMatchObject({completed: false, blocked: ["jobs"], overdue: ["jobs"]});
  });
  it("preserves held expired data without authorizing its use", () => {
    expect(evaluateRetentionDisposition({currentlyAuthorized: true, expired: true, legalHold: true, deletionStarted: false})).toEqual({mayUse: false, mayErase: false, disposition: "preserve_under_hold"});
  });
  it("never turns preservation or completion into a new delegation", () => {
    expect(evaluateRetentionDisposition({currentlyAuthorized: false, expired: false, legalHold: true, deletionStarted: false}).mayUse).toBe(false);
    expect(evaluateRetentionDisposition({currentlyAuthorized: true, expired: false, legalHold: false, deletionStarted: true}).mayUse).toBe(false);
  });
  it("allows erasure only for expired unheld data", () => {
    expect(evaluateRetentionDisposition({currentlyAuthorized: false, expired: false, legalHold: false, deletionStarted: false}).mayErase).toBe(false);
    expect(evaluateRetentionDisposition({currentlyAuthorized: false, expired: true, legalHold: false, deletionStarted: false}).mayErase).toBe(true);
  });
});
