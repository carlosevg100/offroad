import {
  underwriteReceivablesPool,
  type ReceivablesPoolUnderwritingInput,
} from "@offroad/receivables-analysis";
import {describe, expect, it} from "vitest";

import {buildReceivablesTape, receivablesReferenceDate} from "./receivables";
import {company, interim2026, request} from "./truth";
import {buildSyntheticReceivablesCase} from "../synthetic-receivables-case";

describe("Aurora receivables underwriting gold", () => {
  it("reproduces the declared Case 03 borrowing base and refuses to overstate coverage", () => {
    const rows = buildReceivablesTape();
    const simple = buildSyntheticReceivablesCase({
      id: "gc03-aurora-2026-07",
      referenceDate: receivablesReferenceDate,
      cedentName: company.legalName,
      tape: rows.map((row) => ({
        receivableId: row.receivableId,
        debtorId: row.debtorId,
        balance: String(row.balance),
        daysPastDue: row.daysPastDue,
      })),
    });
    const encumbranceOf = new Map<string, "free" | "pledged" | "assigned">(
      rows.map((row) => [row.receivableId, row.encumbrance]),
    );
    const sectorOf = new Map(rows.map((row) => [row.receivableId, row.sector]));
    const caseData: ReceivablesPoolUnderwritingInput["case"] = {
      ...simple,
      portfolio: simple.portfolio.map((item) => ({
        ...item,
        encumbrance: encumbranceOf.get(item.id) ?? "unknown",
        debtorSector: sectorOf.get(item.id) === "public" ? "public_sector" : "construction_distribution",
        sourceDocumentId: "10_Tape_Duplicatas_Jul2026.csv",
        sourceAnchor: `row:${item.id}`,
      })),
      accounting: {...simple.accounting, grossReceivablesBalance: String(interim2026.receivables)},
      structure: {
        ...simple.structure,
        requestedFacility: String(request.useOfProceeds[0].amount),
        actualSeniorAmount: String(request.useOfProceeds[0].amount),
        actualSubordinatedAmount: "0",
      },
    };
    const result = underwriteReceivablesPool({currency: "BRL", case: caseData});

    expect(result.portfolio_summary).toMatchObject({
      receivableCount: 495,
      debtorCount: 45,
      totalOutstanding: "51940000.00",
      preliminaryEligibleBalance: "26217914.00",
      concentrationAdjustedEligibleBalance: "26217914.00",
      eligibleShare: "0.50477308",
      topDebtorShare: "0.18100000",
      topFiveDebtorShare: "0.47600000",
    });
    expect(result.evidence_coverage.freeBalanceShare).toBe("0.53162281");
    expect(result.performance.delinquency30Share).toBe("0.10739919");
    expect(result.performance.delinquency90Share).toBe("0.02684973");
    expect(result.borrowing_base).toMatchObject({
      requestedFacility: "25000000.00",
      maximumByAdvanceRate: "19663435.50",
      maximumByOvercollateralization: "20974331.20",
      supportedFacility: "19663435.50",
    });
    expect(result.state).toBe("needs_remediation");
    expect(result.decision_boundary.blockingCodes).toEqual(expect.arrayContaining([
      "facility_above_borrowing_base",
      "trigger_eligible_share",
    ]));
    expect(result.decision_boundary.remediationCodes).toContain("trigger_subordination");
    expect(result.decision_boundary.externalDirectionAllowed).toBe(false);
  });
});
