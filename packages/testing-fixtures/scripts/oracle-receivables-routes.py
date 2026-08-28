#!/usr/bin/env python3
"""Independent route-status oracle. It imports no TypeScript implementation."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CASES = json.loads((ROOT / "gold/receivables-phase-two/route-cases.json").read_text())

COMMON = [
    ("claim_existence_evidenced", True, "hard"),
    ("cedent_ownership_confirmed", True, "hard"),
    ("contractual_assignability_confirmed", True, "hard"),
    ("unresolved_prior_assignment_or_lien", False, "hard"),
    ("performance_or_delivery_evidenced", True, "remediable"),
    ("title_control_and_duplicate_check_available", True, "remediable"),
    ("debtor_notice_or_acknowledgement_feasible", True, "remediable"),
]
PORTFOLIO = [
    ("analytical_tape_available", True, "remediable"),
    ("historical_performance_available", True, "remediable"),
    ("controlled_collections_feasible", True, "remediable"),
    ("servicing_capability_available", True, "remediable"),
]
ROUTES = {
    "factoring_purchase": COMMON,
    "financial_institution_receivables_discount": COMMON + [("company_credit_package_available", True, "remediable")],
    "digital_credit_receivables_purchase": COMMON + [("company_credit_package_available", True, "remediable")],
    "fidc_multicedent_assignment": COMMON + PORTFOLIO + [("recurring_origination_available", True, "remediable")],
    "buyer_confirmed_payables_program": [
        ("claim_existence_evidenced", True, "hard"),
        ("cedent_ownership_confirmed", True, "hard"),
        ("performance_or_delivery_evidenced", True, "remediable"),
        ("buyer_confirmed_program_available", True, "hard"),
    ],
    "secured_revolving_facility": [
        ("company_credit_package_available", True, "hard"),
        ("cedent_ownership_confirmed", True, "hard"),
        ("eligible_collateral_pool_identified", True, "remediable"),
        ("security_perfection_feasible", True, "remediable"),
        ("unresolved_prior_assignment_or_lien", False, "hard"),
    ],
    "ccb_with_fiduciary_assignment": [
        ("company_credit_package_available", True, "hard"),
        ("cedent_ownership_confirmed", True, "hard"),
        ("eligible_collateral_pool_identified", True, "remediable"),
        ("security_perfection_feasible", True, "remediable"),
        ("unresolved_prior_assignment_or_lien", False, "hard"),
    ],
    "dedicated_receivables_vehicle": COMMON + PORTFOLIO + [
        ("recurring_origination_available", True, "remediable"),
        ("economically_viable_scale_confirmed", True, "remediable"),
        ("institutional_vehicle_governance_ready", True, "remediable"),
    ],
    "receivables_certificate_securitisation": COMMON + PORTFOLIO + [
        ("economically_viable_scale_confirmed", True, "remediable"),
        ("institutional_vehicle_governance_ready", True, "remediable"),
    ],
}


def status(case, criteria):
    estimated = set(case.get("estimatedFacts", []))
    hard_unknown = False
    conditional = False
    for fact, expected, severity in criteria:
        state = case["facts"].get(fact, "unknown")
        if state == "unknown" or fact in estimated:
            if severity == "hard":
                hard_unknown = True
            else:
                conditional = True
            continue
        matches = (state == "true") == expected
        if not matches and severity == "hard":
            return "ineligible"
        if not matches:
            conditional = True
    if hard_unknown:
        return "not_evaluated"
    return "conditionally_eligible" if conditional else "technically_eligible"


for case in CASES["cases"]:
    actual = {route: status(case, criteria) for route, criteria in ROUTES.items()}
    if actual != case["expected"]:
        raise SystemExit(f"oracle mismatch for {case['id']}: {actual} != {case['expected']}")

print(f"verified {len(CASES['cases'])} independent route cases")
