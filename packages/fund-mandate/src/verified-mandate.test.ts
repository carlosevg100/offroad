import {describe, expect, it} from "vitest";

import {
  daysBetween,
  isCurrentMandate,
  mandateRenewalState,
  verifiedMandateRecordSchema,
  type VerifiedMandateRecord,
} from "./verified-mandate";

const asOf = "2026-09-10";

function record(overrides: Partial<VerifiedMandateRecord> = {}): VerifiedMandateRecord {
  return verifiedMandateRecordSchema.parse({
    versionNumber: 1,
    status: "confirmed",
    effectiveStatus: "confirmed",
    validFrom: "2026-03-01",
    validUntil: "2027-03-01",
    confirmedAt: "2026-03-01T12:00:00+00:00",
    channel: "official_document",
    confirmationCount: 1,
    ...overrides,
  });
}

describe("verified mandate record", () => {
  it("counts whole days in both directions and tolerates a timestamp", () => {
    expect(daysBetween("2026-09-10", "2026-09-20")).toBe(10);
    expect(daysBetween("2026-09-20", "2026-09-10")).toBe(-10);
    expect(daysBetween("2026-03-01T12:00:00+00:00", "2026-03-08")).toBe(7);
    expect(daysBetween("not a date", "2026-09-10")).toBe(0);
  });

  it("treats only a confirmed record inside its window as current", () => {
    expect(isCurrentMandate(record())).toBe(true);
    expect(isCurrentMandate(record({effectiveStatus: "expired"}))).toBe(false);
    expect(isCurrentMandate(record({effectiveStatus: "draft", confirmedAt: null, channel: null, confirmationCount: 0}))).toBe(false);
    expect(isCurrentMandate(null)).toBe(false);
  });

  it("asks for a renewal before the window shuts, never after it silently stops matching", () => {
    expect(mandateRenewalState(record(), asOf)).toBe("current");
    expect(mandateRenewalState(record({validUntil: "2026-09-25"}), asOf)).toBe("due_soon");
    expect(mandateRenewalState(record({validUntil: "2026-10-25"}), asOf)).toBe("current");
    // The boundary belongs to the warning: a window closing exactly on the threshold is due.
    expect(mandateRenewalState(record({validUntil: "2026-10-10"}), asOf)).toBe("due_soon");
  });

  it("ages an open window instead of treating a blank end date as permanent", () => {
    expect(mandateRenewalState(record({validUntil: null}), asOf)).toBe("current");
    expect(mandateRenewalState(record({validUntil: null, confirmedAt: "2025-01-05T00:00:00+00:00"}), asOf)).toBe("due_soon");
    expect(mandateRenewalState(
      record({validUntil: null, confirmedAt: "2025-01-05T00:00:00+00:00"}),
      asOf,
      {openWindowDueAfterDays: 1000},
    )).toBe("current");
  });

  it("keeps expiry, withdrawal and never-confirmed apart", () => {
    expect(mandateRenewalState(record({effectiveStatus: "expired", validUntil: "2026-08-01"}), asOf)).toBe("expired");
    expect(mandateRenewalState(record({status: "withdrawn", effectiveStatus: "withdrawn"}), asOf)).toBe("withdrawn");
    expect(mandateRenewalState(
      record({status: "draft", effectiveStatus: "draft", confirmedAt: null, channel: null, confirmationCount: 0}),
      asOf,
    )).toBe("unconfirmed");
  });

  it("refuses a record that claims a channel this product cannot evidence", () => {
    expect(() => verifiedMandateRecordSchema.parse({...record(), channel: "public_registration"})).toThrow();
    expect(() => verifiedMandateRecordSchema.parse({...record(), versionNumber: 0})).toThrow();
    expect(() => verifiedMandateRecordSchema.parse({...record(), extra: true})).toThrow();
  });
});
