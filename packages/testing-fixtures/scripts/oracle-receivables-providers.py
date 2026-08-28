#!/usr/bin/env python3
"""Independent Phase 2B status and allocation oracle. Imports no TypeScript code."""

import json
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CASES = json.loads((ROOT / "gold/receivables-phase-two-b/provider-cases.json").read_text())


def evaluate(case):
    allocation = min(
        Decimal(case["requestedAmount"]),
        Decimal(case["ticketMaximum"]),
        Decimal(case["availableCapacity"]),
        Decimal(case["eligiblePortfolioAmount"]),
    ).quantize(Decimal("0.01"))
    if case["routeStatus"] == "ineligible":
        status = "ineligible"
    elif case["estimatedDilution"]:
        status = "not_evaluated"
    elif Decimal(case["eligiblePortfolioAmount"]) < Decimal(case["ticketMinimum"]):
        status = "ineligible"
    elif case["capacitySource"] not in {"direct_declaration", "relationship_confirmation"}:
        status = "policy_fit_confirmed"
        allocation = None
    elif case["liveAppetite"] and allocation >= Decimal(case["ticketMinimum"]):
        status = "live_appetite_confirmed"
    else:
        status = "policy_fit_confirmed"
    return status, None if allocation is None else f"{allocation:.2f}"


for case in CASES["cases"]:
    status, allocation = evaluate(case)
    if status != case["expectedStatus"]:
        raise SystemExit(f"status mismatch for {case['id']}: {status} != {case['expectedStatus']}")
    if allocation != case["expectedMaximumConfirmedAllocation"]:
        raise SystemExit(
            f"allocation mismatch for {case['id']}: {allocation} != {case['expectedMaximumConfirmedAllocation']}"
        )

print(f"verified {len(CASES['cases'])} independent provider cases")
