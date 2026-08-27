#!/usr/bin/env python3
"""Independent debt, pricing, CET and advance-rate oracle for Vertentes.

This script intentionally shares no implementation with financial-core. It reads a
frozen economic input, applies the approved formulas directly with Decimal, and
writes the gold output used by the TypeScript equality test.
"""

from __future__ import annotations

import datetime as dt
import json
from decimal import Decimal, ROUND_HALF_UP, getcontext
from pathlib import Path

getcontext().prec = 60

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "gold" / "vertentes" / "source" / "structure-cost-input.json"
OUTPUT = ROOT / "gold" / "vertentes" / "expected" / "structure-cost.json"
ONE = Decimal(1)


def canonical(value: Decimal) -> str:
    rounded = value.quantize(Decimal("0.00000001"), rounding=ROUND_HALF_UP)
    return format(rounded, "f").rstrip("0").rstrip(".") if rounded else "0"


def compound_factor(rates: list[Decimal], exponent: Decimal) -> Decimal:
    factor = ONE
    for rate in rates:
        factor *= (ONE + rate) ** exponent
    return factor


def xirr(flows: list[tuple[dt.date, Decimal]]) -> Decimal:
    flows = sorted(flows)
    start = flows[0][0]

    def npv(rate: Decimal) -> Decimal:
        return sum((amount / (ONE + rate) ** (Decimal((date - start).days) / Decimal(365)) for date, amount in flows), Decimal(0))

    lower = Decimal("-0.999999999999")
    upper = Decimal(1)
    lower_npv = npv(lower)
    upper_npv = npv(upper)
    while lower_npv * upper_npv > 0 and upper < Decimal(1_000_000):
        upper = upper * 2 + ONE
        upper_npv = npv(upper)
    if lower_npv * upper_npv > 0:
        raise RuntimeError("CET root not bracketed")
    for _ in range(256):
        midpoint = (lower + upper) / 2
        midpoint_npv = npv(midpoint)
        if abs(midpoint_npv) <= Decimal("1e-24") or abs(upper - lower) <= Decimal("1e-24"):
            return midpoint
        if lower_npv * midpoint_npv <= 0:
            upper = midpoint
        else:
            lower = midpoint
            lower_npv = midpoint_npv
    return (lower + upper) / 2


def main() -> None:
    source = json.loads(SOURCE.read_text())
    debt = source["debt"]
    included = {
        "bank_debt",
        "receivables_assignment_with_recourse",
        "reverse_factoring",
        "factoring_with_recourse",
        "tax_installment",
    }
    positions = debt["positions"]
    declared_positions = sum((Decimal(item["principal"]) + Decimal(item.get("accruedInterest", "0")) for item in positions if item["category"] in included and item["declarationStatus"] == "company_declared"), Decimal(0))
    not_declared = sum((Decimal(item["principal"]) + Decimal(item.get("accruedInterest", "0")) for item in positions if item["category"] in included and item["declarationStatus"] == "identified_not_declared"), Decimal(0))
    declared = Decimal(debt["companyDeclaredDebt"]["value"])
    cash = Decimal(debt["cash"]["value"])
    ebitda = Decimal(debt["ebitdaForLeverage"]["value"])
    gross = declared_positions + not_declared
    net = gross - cash

    factoring = source["rateScenarios"]["primeFactoring"]
    face = Decimal(factoring["faceValue"])
    days = Decimal(factoring["calendarDays"])
    outside_rate = Decimal(factoring["monthlyOutsideDiscountRate"])
    ad_valorem = Decimal(factoring["adValoremRate"])
    outside_discount = face * outside_rate * days / Decimal(30)
    outside_price = face - outside_discount
    outside_factor = face / outside_price
    net_proceeds = outside_price - face * ad_valorem
    cet_annual = xirr([
        (dt.date.fromisoformat(factoring["startDate"]), net_proceeds),
        (dt.date.fromisoformat(factoring["maturityDate"]), -face),
    ])

    institutional = source["rateScenarios"]["institutionalIllustration"]
    institutional_face = Decimal(institutional["faceValue"])
    institutional_calendar_days = Decimal(institutional["calendarDays"])
    institutional_factor = compound_factor(
        [Decimal(value) for value in institutional["annualRates"]],
        Decimal(institutional["businessDays"]) / Decimal(252),
    )
    institutional_price = institutional_face / institutional_factor

    advance = source["advanceRateScenario"]
    dilution_reserve = Decimal(advance["expectedDilution"]) * Decimal(advance["dilutionStressMultiplier"])
    loss_reserve = Decimal(advance["expectedLossRate"]) * Decimal(advance["lossStressMultiplier"])
    operating_reserve = Decimal(advance["operationalReserve"])
    total_reserve = dilution_reserve + loss_reserve + operating_reserve

    output = {
        "version": "2026.08.27-v1",
        "debt": {
            "companyDeclaredDebt": canonical(declared),
            "declaredPositionSubtotal": canonical(declared_positions),
            "identifiedNotDeclaredSubtotal": canonical(not_declared),
            "declaredPositionMismatch": canonical(declared_positions - declared),
            "adjustedGrossDebt": canonical(gross),
            "adjustmentToCompanyDeclaration": canonical(gross - declared),
            "cash": canonical(cash),
            "adjustedNetDebt": canonical(net),
            "ebitdaForLeverage": canonical(ebitda),
            "ebitdaBasis": debt["ebitdaForLeverage"]["basis"],
            "adjustedNetLeverage": canonical(net / ebitda),
        },
        "primeFactoring": {
            "sourceRegime": "outside_simple_monthly",
            "acquisitionPriceBeforeFees": canonical(outside_price),
            "discountAmount": canonical(outside_discount),
            "discountShareOfFace": canonical(outside_discount / face),
            "effectivePeriodRateBeforeFees": canonical(outside_factor - ONE),
            "effectiveMonthlyRateBeforeFees": canonical(outside_factor ** (Decimal(30) / days) - ONE),
            "effectiveAnnualRateBeforeFees": canonical(outside_factor ** (Decimal(365) / days) - ONE),
            "adValoremFee": canonical(face * ad_valorem),
            "netInitialProceeds": canonical(net_proceeds),
            "cetMonthly": canonical((ONE + cet_annual) ** (Decimal(30) / Decimal(365)) - ONE),
            "cetAnnual": canonical(cet_annual),
            "taxInputStatus": "not_provided",
        },
        "institutionalIllustration": {
            "sourceRegime": "inside_compound_annual_business",
            "acquisitionPrice": canonical(institutional_price),
            "discountAmount": canonical(institutional_face - institutional_price),
            "effectivePeriodRate": canonical(institutional_factor - ONE),
            "effectiveMonthlyRate": canonical(institutional_factor ** (Decimal(30) / institutional_calendar_days) - ONE),
            "effectiveAnnualRate": canonical(institutional_factor ** (Decimal(365) / institutional_calendar_days) - ONE),
        },
        "advanceRateScenario": {
            "status": advance["status"],
            "stressedDilutionReserve": canonical(dilution_reserve),
            "stressedLossReserve": canonical(loss_reserve),
            "operationalReserve": canonical(operating_reserve),
            "totalReserve": canonical(total_reserve),
            "implicitAdvanceRate": canonical(ONE - total_reserve),
        },
        "legacyCorrections": [
            "The legacy 57.4% annual factoring estimate applied the period charge to face value. CET uses net borrower proceeds and is higher.",
            "The legacy 5.03x leverage used a 4.16m adjusted EBITDA unsupported by the intake room. The executable gold uses the evidenced 3.84m reported 2025 EBITDA.",
        ],
    }
    OUTPUT.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n")
    print(f"Vertentes structure/cost oracle: {OUTPUT}")


if __name__ == "__main__":
    main()
