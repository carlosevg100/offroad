"""Independent generator of the market-odbl.v1 canonical-bytes vectors (docs/build/market-reference/M2-PARTE-3.md).
Run: python3 -I generate_market_odbl.py market-odbl-canonical.json. It shares no code with the TypeScript or SQL
implementations it checks: object keys by code point, no whitespace, arrays in order, strings only for numbers
(a number is refused), minimal escaping (quote, backslash, controls below U+0020 as a lowercase six-character
escape), a final newline added by the caller."""
import json, hashlib, sys

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
    raise ValueError('number')

cases = [
  ("empty_object", {}),
  ("empty_array", []),
  ("key_order_by_code_point", {"b": "1", "a": "2", "B": "3", "é": "4", "z": "5", "aa": "6"}),
  ("nested_arrays_keep_order", {"x": ["3", "1", "2", [], {}], "y": [True, False, None]}),
  ("escapes", {"q": 'a"b', "b": "a\\b", "c": "\n\t\x01\x1f", "d": "\x7f/é€😀"}),
  ("unicode_keys", {"ç": "1", "c": "2", "😀": "3", "é": "4", "\ufb00": "5", "\uffff": "6"}),
  ("realistic", {"format": "offroad.market-odbl.v1", "release": "1", "observations": [{"period": "2025-09-17", "value": "15", "versionId": "00000000-0000-4000-8000-000000000001", "acquisitionId": "00000000-0000-4000-8000-000000000002"}], "alterations": {"previous": None}}),
]
refusals = [("number", {"a": 1}), ("nested_number", {"a": ["1", 2.5]})]
out = {"schemaVersion": "offroad.market-odbl-vectors.v1",
  "generatedBy": "independent Python implementation of market-odbl.v1",
  "cases": [{"name": n, "input": v, "canonical": canon(v), "sha256": hashlib.sha256((canon(v) + "\n").encode()).hexdigest()} for n, v in cases],
  "refusals": [{"name": n, "input": v} for n, v in refusals]}
f = open(sys.argv[1], 'w'); json.dump(out, f, ensure_ascii=False, indent=1); f.write("\n")
print(len(cases), len(refusals))
