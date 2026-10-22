"""Independent generator of the RG-01 monitor vectors (docs/build/market-reference/M2-PARTE-6.md).
Run: python3 -I generate_market_rg01.py market-rg01.json. It shares no code with the TypeScript or SQL
implementations it checks. It writes three groups: market-policy.v1 canonical texts, freshness deadlines and
evaluator cases (snapshot facts in, result out, with the semantic state text and its SHA-256)."""
import datetime as dt, hashlib, json, sys
from decimal import Decimal

# --- market-policy.v1: market-odbl.v1 with JSON integers written as decimal text --------------------------
def s(t):
    out = []
    for ch in t:
        o = ord(ch)
        if ch == '"': out.append('\\"')
        elif ch == '\\': out.append('\\\\')
        elif o < 0x20: out.append('\\u%04x' % o)
        else: out.append(ch)
    return '"' + ''.join(out) + '"'

def canon(v):
    if isinstance(v, dict):
        return '{' + ','.join(s(k) + ':' + canon(v[k]) for k in sorted(v, key=lambda k: [ord(c) for c in k])) + '}'
    if isinstance(v, list): return '[' + ','.join(canon(x) for x in v) + ']'
    if v is True: return 'true'
    if v is False: return 'false'
    if v is None: return 'null'
    if isinstance(v, str): return s(v)
    if isinstance(v, int): return str(v)
    raise ValueError('fraction')

policy_cases = [
  ("integers_and_text", {"b": -125, "a": 5, "c": "13.75", "d": [0, 25, {"z": True, "y": None}]}),
  ("nested_order", {"trigger": {"scope": "todas", "id": "RG-01"}, "easingCycle": {"cuts": 5, "stepBps": 25}}),
  ("unicode_keys", {"é": 1, "e": 2, "\U0001F600": 3}),
]
policy_refusals = [("fraction", {"a": 95.55}), ("nested_fraction", {"a": [1, {"b": 0.5}]})]

# --- business days ----------------------------------------------------------------------------------------
def easter(y):
    a = y % 19; b = y // 100; c = y % 100; d = b // 4; e = b % 4; f = (b + 8) // 25; g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30; i = c // 4; k = c % 4; l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451; month = (h + l - 7 * m + 114) // 31; day = (h + l - 7 * m + 114) % 31 + 1
    return dt.date(y, month, day)

def holiday(d):
    fixed = {(1, 1), (4, 21), (5, 1), (9, 7), (10, 12), (11, 2), (11, 15), (12, 25)}
    if (d.month, d.day) in fixed: return True
    if (d.month, d.day) == (11, 20) and d.year >= 2024: return True
    e = easter(d.year)
    return d in (e - dt.timedelta(48), e - dt.timedelta(47), e - dt.timedelta(2), e + dt.timedelta(60))

def next_business(d):
    d = d + dt.timedelta(1)
    while d.isoweekday() in (6, 7) or holiday(d): d = d + dt.timedelta(1)
    return d

def deadline(end):
    d = next_business(dt.date.fromisoformat(end))
    return next_business(next_business(d)).isoformat()

deadline_cases = ["2023-11-01", "2025-06-18", "2026-03-18", "2026-09-16", "2026-11-04", "2026-12-09", "2026-04-29", "2027-02-10"]

# --- evaluator --------------------------------------------------------------------------------------------
def dec(x): return Decimal(x)

def state_of(m):
    c = m["communique"]
    if c is not None and c["disputed"]: return "disputed"
    if c is not None and not c["readable"]: return "unavailable"
    if c is None: return "missing"
    if m["previous"] is None or m["change"] is None: return "awaiting_series"
    p, n, t = dec(m["previous"]), dec(m["change"]), dec(c["targetPct"])
    ok = {"raise": n > p, "cut": n < p, "hold": n == p}[c["decision"]] and n == t
    return "corroborated" if ok else "series_disagreement"

GAP = {"missing": "communique_missing", "awaiting_series": "series_pending", "series_disagreement": "series_disagreement",
       "unavailable": "communique_unavailable", "disputed": "meeting_disputed"}

def evaluate(snap):
    D = snap["dataBase"]; decl = snap["declaration"]; cyc = decl["cycle"]
    last_declared = max(cyc["decisions"])
    meetings = sorted(snap["meetings"], key=lambda m: m["endDate"])
    rows = []
    for m in meetings:
        st = state_of(m)
        rows.append({"endDate": m["endDate"], "state": st, "deadline": deadline(m["endDate"]),
                     "decision": m["communique"]["decision"] if m["communique"] else None,
                     "baseline": m["endDate"] in cyc["decisions"],
                     "relevant": last_declared < m["endDate"] <= D, "m": m})
    relevant = [r for r in rows if r["relevant"]]
    missing_years = [y for y in snap["calendarYearsRequired"] if y not in snap["calendarYearsPresent"]]
    gaps = ["calendar_missing:%d" % y for y in missing_years]
    gaps += ["%s:%s" % (GAP[r["state"]], r["endDate"]) for r in relevant if r["state"] != "corroborated"]
    witnesses = [r["endDate"] for r in relevant if r["decision"] == "raise" and r["state"] == "corroborated"]
    if witnesses: result = "fired"
    elif any(r["decision"] == "raise" and r["state"] == "awaiting_series" for r in relevant): result = "pending_confirmation"
    elif not missing_years and all(r["state"] == "corroborated" for r in relevant): result = "not_fired"
    else: result = "incomplete"
    # Decision 5, in this order: a relevant meeting past its deadline and not corroborated; no observation; current.
    if any(r["deadline"] < D and r["state"] != "corroborated" for r in relevant): fresh = "stale"
    elif snap["selectionEntries"] == 0: fresh = "absent"
    else: fresh = "current"
    # Baseline.
    contra = []
    base = {r["endDate"]: r for r in rows if r["baseline"]}
    for d in cyc["decisions"]:
        r = base.get(d)
        if r is None or r["state"] != "corroborated" or r["decision"] != "cut": contra.append("baseline_meeting:%s" % d)
    if len(cyc["decisions"]) != cyc["cuts"]: contra.append("baseline_count")
    if not [c for c in contra if c.startswith("baseline_meeting")]:
        prev_first = dec(base[cyc["decisions"][0]]["m"]["previous"])
        if prev_first != dec(cyc["fromPct"]): contra.append("baseline_from")
        total = Decimal(0)
        for d in cyc["decisions"]:
            m = base[d]["m"]; step = (dec(m["previous"]) - dec(m["change"])) * 100
            total += step
            if step != cyc["stepBps"]: contra.append("baseline_step:%s" % d)
        if dec(base[cyc["decisions"][-1]]["m"]["change"]) != dec(cyc["finalPct"]): contra.append("baseline_final")
        if -total != cyc["cumulativeBps"]: contra.append("baseline_cumulative")
    gaps = sorted(gaps, key=lambda g: [ord(c) for c in g]); contra = sorted(contra, key=lambda g: [ord(c) for c in g])
    text = "\n".join(["market-rg01-state.v1", "declaration:" + decl["id"], "result:" + result, "freshness:" + fresh,
                      "primary:" + (witnesses[0] if witnesses else ""), *["witness:" + w for w in witnesses],
                      *["meeting:%s|%s" % (r["endDate"], r["state"]) for r in rows if r["relevant"] or r["baseline"]],
                      *["gap:" + g for g in gaps], *["baseline:" + c for c in contra], "entries:" + snap["entriesSha256"]])
    return {"result": result, "freshness": fresh, "primaryWitness": witnesses[0] if witnesses else None, "witnesses": witnesses,
            "meetings": [{"endDate": r["endDate"], "state": r["state"], "deadline": r["deadline"], "relevant": r["relevant"], "baseline": r["baseline"]} for r in rows],
            "gaps": gaps, "baselineContradictions": contra, "stateText": text, "stateSha256": hashlib.sha256(text.encode()).hexdigest()}

DECL = {"id": "decl-1", "cycle": {"decisions": ["2026-03-18", "2026-04-29", "2026-06-17", "2026-08-05", "2026-09-16"],
        "fromPct": "15.00", "finalPct": "13.75", "stepBps": 25, "cuts": 5, "cumulativeBps": -125}}
BASE_PCTS = ["15.00", "14.75", "14.50", "14.25", "14.00", "13.75"]

def comm(decision, target, readable=True, disputed=False, meeting=1):
    return {"meeting": meeting, "decision": decision, "targetPct": target, "readable": readable, "disputed": disputed}

def baseline(mutate=None):
    out = []
    for i, d in enumerate(DECL["cycle"]["decisions"]):
        m = {"endDate": d, "kind": "ordinary", "communique": comm("cut", BASE_PCTS[i + 1], meeting=280 + i), "previous": BASE_PCTS[i], "change": BASE_PCTS[i + 1]}
        if mutate: mutate(i, m)
        out.append(m)
    return out

def snap(D, extra, years=(2026,), required=(2026,), entries=200, base=None):
    return {"dataBase": D, "declaration": DECL, "calendarYearsRequired": list(required), "calendarYearsPresent": list(years),
            "selectionEntries": entries, "entriesSha256": hashlib.sha256(("entries:" + D).encode()).hexdigest(),
            "meetings": (base if base is not None else baseline()) + extra}

NOV = "2026-11-04"; DEC = "2026-12-09"
cases = [
  ("hold_after_cycle", snap("2026-11-20", [{"endDate": NOV, "kind": "ordinary", "communique": comm("hold", "13.75", meeting=285), "previous": "13.75", "change": "13.75"}])),
  ("first_raise", snap("2026-11-20", [{"endDate": NOV, "kind": "ordinary", "communique": comm("raise", "14.00", meeting=285), "previous": "13.75", "change": "14.00"}])),
  ("raise_off_step", snap("2026-11-20", [{"endDate": NOV, "kind": "ordinary", "communique": comm("raise", "14.50", meeting=285), "previous": "13.75", "change": "14.50"}])),
  ("cut_after_raise", snap("2026-12-20", [{"endDate": NOV, "kind": "ordinary", "communique": comm("raise", "14.00", meeting=285), "previous": "13.75", "change": "14.00"},
                                          {"endDate": DEC, "kind": "ordinary", "communique": comm("cut", "13.75", meeting=286), "previous": "14.00", "change": "13.75"}])),
  ("raise_awaiting_series", snap(NOV, [{"endDate": NOV, "kind": "ordinary", "communique": comm("raise", "14.00", meeting=285), "previous": "13.75", "change": None}])),
  ("meeting_day_missing", snap(NOV, [{"endDate": NOV, "kind": "ordinary", "communique": None, "previous": "13.75", "change": None}])),
  ("missing_before_deadline", snap("2026-11-06", [{"endDate": NOV, "kind": "ordinary", "communique": None, "previous": "13.75", "change": "13.75"}])),
  ("missing_after_deadline", snap("2026-11-12", [{"endDate": NOV, "kind": "ordinary", "communique": None, "previous": "13.75", "change": "13.75"}])),
  ("unavailable_communique", snap("2026-11-20", [{"endDate": NOV, "kind": "ordinary", "communique": comm("raise", "14.00", readable=False, meeting=285), "previous": "13.75", "change": "14.00"}])),
  ("disputed_meeting", snap("2026-11-20", [{"endDate": NOV, "kind": "ordinary", "communique": comm("hold", "13.75", disputed=True, meeting=285), "previous": "13.75", "change": "13.75"}])),
  ("series_disagreement", snap("2026-11-20", [{"endDate": NOV, "kind": "ordinary", "communique": comm("hold", "13.75", meeting=285), "previous": "13.75", "change": "14.00"}])),
  ("raise_with_unrelated_gap", snap("2026-12-20", [{"endDate": NOV, "kind": "ordinary", "communique": comm("raise", "14.00", meeting=285), "previous": "13.75", "change": "14.00"},
                                                   {"endDate": DEC, "kind": "ordinary", "communique": None, "previous": "14.00", "change": None}])),
  ("calendar_missing", snap("2027-01-05", [], years=(2026,), required=(2026, 2027))),
  ("no_meetings_complete", snap("2026-10-22", [])),
  ("absent_selection", snap("2026-10-22", [], entries=0)),
  ("due_meeting_without_series", snap("2026-11-12", [{"endDate": NOV, "kind": "ordinary", "communique": None, "previous": None, "change": None}], entries=0)),
  ("calendar_missing_nothing_due", snap("2026-11-03", [], years=(), required=(2026,))),
  ("extraordinary_raise", snap("2026-10-22", [{"endDate": "2026-10-10", "kind": "extraordinary", "communique": comm("raise", "14.25", meeting=900), "previous": "13.75", "change": "14.25"}])),
  ("second_raise", snap("2026-12-20", [{"endDate": NOV, "kind": "ordinary", "communique": comm("raise", "14.00", meeting=285), "previous": "13.75", "change": "14.00"},
                                       {"endDate": DEC, "kind": "ordinary", "communique": comm("raise", "14.25", meeting=286), "previous": "14.00", "change": "14.25"}])),
  ("baseline_contradicted", snap("2026-10-22", [], base=baseline(lambda i, m: m.update(change="14.70", communique=comm("cut", "14.70", meeting=281)) if i == 1 else None))),
  ("baseline_hold_in_cycle", snap("2026-10-22", [], base=baseline(lambda i, m: m.update(change=m["previous"], communique=comm("hold", m["previous"], meeting=282)) if i == 2 else None))),
]

def main(path):
    out = {"schemaVersion": "market-rg01-vectors.v1", "generatedBy": "generate_market_rg01.py",
           "policyCanonical": [{"name": n, "value": v, "text": canon(v) + "\n", "sha256": hashlib.sha256((canon(v) + "\n").encode()).hexdigest()} for n, v in policy_cases],
           "policyRefusals": [{"name": n, "value": v} for n, v in policy_refusals],
           "deadlines": [{"endDate": e, "deadline": deadline(e)} for e in deadline_cases],
           "evaluations": [{"name": n, "snapshot": sn, "expected": evaluate(sn)} for n, sn in cases]}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1); f.write("\n")

if __name__ == "__main__":
    main(sys.argv[1])
