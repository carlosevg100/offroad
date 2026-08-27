#!/usr/bin/env python3
"""Independent dynamic-metrics oracle for the synthetic Vertentes gold case.

This script intentionally does not import the TypeScript financial core. It reads the
reserved generator truth and applies the approved definitions directly so the gold
does not certify the implementation with its own output.
"""

from __future__ import annotations

import calendar
import json
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "gold" / "vertentes" / "source" / "base-final.json"
OUTPUT = ROOT / "gold" / "vertentes" / "expected" / "dynamic-metrics.json"
REPORTING_DATE = date(2026, 6, 30)
DATA_START_DATE = date(2024, 7, 1)
HORIZONS = (30, 60, 90, 120, 180, 360)
BUCKETS = (
    "not_due",
    "past_due_1_15",
    "past_due_16_30",
    "past_due_31_60",
    "past_due_61_90",
    "past_due_91_180",
    "past_due_over_180",
)
DESTINATIONS = (*BUCKETS, "resolved")


def dec(value: object) -> Decimal:
    return Decimal(str(value))


def canonical(value: Decimal) -> str:
    rounded = value.quantize(Decimal("0.00000001"), rounding=ROUND_HALF_UP)
    rendered = format(rounded, "f").rstrip("0").rstrip(".")
    return rendered or "0"


def month_end(value: date) -> date:
    return value.replace(day=calendar.monthrange(value.year, value.month)[1])


def next_month_end(value: date) -> date:
    year = value.year + (1 if value.month == 12 else 0)
    month = 1 if value.month == 12 else value.month + 1
    return date(year, month, calendar.monthrange(year, month)[1])


def bucket(due_date: date, as_of: date) -> str:
    days = (as_of - due_date).days
    if days <= 0:
        return "not_due"
    if days <= 15:
        return "past_due_1_15"
    if days <= 30:
        return "past_due_16_30"
    if days <= 60:
        return "past_due_31_60"
    if days <= 90:
        return "past_due_61_90"
    if days <= 180:
        return "past_due_91_180"
    return "past_due_over_180"


def normalize(raw: dict[str, object]) -> dict[str, object]:
    payment = date.fromisoformat(str(raw["pag"])) if raw["pag"] else None
    original_due = date.fromisoformat(str(raw.get("venc_original") or raw["venc"]))
    return {
        "id": str(raw["id"]),
        "issue": date.fromisoformat(str(raw["emis"])),
        "due": original_due,
        "current_due": date.fromisoformat(str(raw["venc"])),
        "payment": payment,
        "face": dec(raw["valor"]),
        "paid": dec(raw["vpago"]),
        "dilution": dec(raw["abat"]),
        "status": str(raw["status"]),
    }


def outstanding(title: dict[str, object], as_of: date) -> Decimal:
    if title["issue"] > as_of:
        return Decimal(0)
    resolved = Decimal(0)
    if title["payment"] and title["payment"] <= as_of:
        resolved += title["paid"] + title["dilution"]
    return max(title["face"] - resolved, Decimal(0))


def roll_rates(titles: list[dict[str, object]]) -> list[dict[str, object]]:
    dates: list[date] = []
    cursor = month_end(DATA_START_DATE)
    while cursor <= REPORTING_DATE:
        dates.append(cursor)
        cursor = next_month_end(cursor)
    periods: list[dict[str, object]] = []
    for from_date, to_date in zip(dates, dates[1:]):
        source = defaultdict(Decimal)
        transitions = {row: defaultdict(Decimal) for row in BUCKETS}
        for title in titles:
            from_exposure = outstanding(title, from_date)
            if from_exposure <= 0:
                continue
            source_bucket = bucket(title["due"], from_date)
            source[source_bucket] += from_exposure
            to_exposure = min(outstanding(title, to_date), from_exposure)
            resolved = from_exposure - to_exposure
            if resolved > 0:
                transitions[source_bucket]["resolved"] += resolved
            if to_exposure > 0:
                transitions[source_bucket][bucket(title["due"], to_date)] += to_exposure
        rows: dict[str, object] = {}
        for row in BUCKETS:
            denominator = source[row]
            rows[row] = {
                "sourceExposure": canonical(denominator),
                "transitions": {
                    destination: {
                        "amount": canonical(transitions[row][destination]),
                        "rate": None if denominator == 0 else canonical(transitions[row][destination] / denominator),
                    }
                    for destination in DESTINATIONS
                },
            }
        periods.append({"fromDate": from_date.isoformat(), "toDate": to_date.isoformat(), "rows": rows})
    return periods


def vintages(titles: list[dict[str, object]]) -> list[dict[str, object]]:
    cohorts: dict[str, list[dict[str, object]]] = defaultdict(list)
    for title in titles:
        cohorts[title["issue"].strftime("%Y-%m")].append(title)
    output: list[dict[str, object]] = []
    for cohort_month in sorted(cohorts):
        cohort = cohorts[cohort_month]
        face = sum((title["face"] for title in cohort), Decimal(0))
        horizons: dict[str, object] = {}
        for horizon in HORIZONS:
            fully_observed = all(title["due"] + timedelta(days=horizon) <= REPORTING_DATE for title in cohort)
            if not fully_observed:
                horizons[str(horizon)] = {"unresolvedAmount": None, "unresolvedShare": None}
                continue
            unresolved = sum(
                (outstanding(title, title["due"] + timedelta(days=horizon)) for title in cohort),
                Decimal(0),
            )
            horizons[str(horizon)] = {
                "unresolvedAmount": canonical(unresolved),
                "unresolvedShare": canonical(unresolved / face),
            }
        output.append({
            "cohortMonth": cohort_month,
            "titleCount": len(cohort),
            "faceValue": canonical(face),
            "horizons": horizons,
        })
    return output


def main() -> None:
    titles = [normalize(item) for item in json.loads(SOURCE.read_text())]
    total_face = sum((title["face"] for title in titles), Decimal(0))
    dilution = sum((title["dilution"] for title in titles), Decimal(0))
    written_off = sum(
        (outstanding(title, REPORTING_DATE) for title in titles if title["status"] == "PERDA"),
        Decimal(0),
    )
    due_titles = [title for title in titles if title["due"] <= REPORTING_DATE]
    due_face = sum((title["face"] for title in due_titles), Decimal(0))
    punctual = [title for title in due_titles if outstanding(title, title["due"]) <= 0]
    punctual_face = sum((title["face"] for title in punctual), Decimal(0))
    extended = [title for title in titles if title["due"] != title["current_due"]]
    extended_face = sum((title["face"] for title in extended), Decimal(0))
    weighted_extension = sum(
        (title["face"] * dec((title["current_due"] - title["due"]).days) for title in extended),
        Decimal(0),
    )
    output = {
        "version": "2026.08.27-v1",
        "rollRates": roll_rates(titles),
        "vintages": vintages(titles),
        "summary": {
            "dilutionAmount": canonical(dilution),
            "dilutionShareOfOrigination": canonical(dilution / total_face),
            "repurchasedAmount": "0",
            "repurchaseShareOfAssigned": None,
            "finalWrittenOffAmount": canonical(written_off),
            "finalWrittenOffShare": canonical(written_off / total_face),
            "adjustedLossAmount": canonical(written_off),
            "adjustedLossShare": canonical(written_off / total_face),
            "dueTitleCount": canonical(dec(len(due_titles))),
            "dueFaceValue": canonical(due_face),
            "punctualByCount": canonical(dec(len(punctual)) / dec(len(due_titles))),
            "punctualByValue": canonical(punctual_face / due_face),
            "extendedTitleCount": canonical(dec(len(extended))),
            "extendedTitleShare": canonical(dec(len(extended)) / dec(len(titles))),
            "extendedFaceValue": canonical(extended_face),
            "extendedFaceShare": canonical(extended_face / total_face),
            "weightedExtensionDays": canonical(weighted_extension / extended_face),
        },
    }
    OUTPUT.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n")
    print(f"Vertentes dynamic oracle: {len(output['rollRates'])} roll periods, {len(output['vintages'])} cohorts")


if __name__ == "__main__":
    main()
