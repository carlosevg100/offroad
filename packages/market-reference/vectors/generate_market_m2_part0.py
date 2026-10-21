"""Independent generator of the M2 part 0 vectors (docs/build/market-reference/M2-CONTRATOS.md).
Run: python3 -I generate_market_m2_part0.py market-m2-part0.json. It shares no code with the
TypeScript or SQL implementations it checks."""
import json, hashlib, sys, datetime
from zoneinfo import ZoneInfo
from decimal import Decimal
SP = ZoneInfo("America/Sao_Paulo")
def sha(t): return hashlib.sha256(t.encode()).hexdigest()

# ---- series contract fingerprint (independent)
contract = ["market-series-contract.v1","id:bcb-sgs-432","host:api.bcb.gov.br","path:/dados/serie/bcdata.sgs.432/dados",
  "unit:percent_per_year","scale:1","convention:meta_copom","parser:bcb-sgs-daily-json.v2","license:bcb-catalog-meta-selic-432",
  "homologated-from:2021-01-14","max-window-years:10","calendar:financial-core.brazilian-national-holidays@2026.10.19-v1"]
CONTRACT_SHA = sha("\n".join(contract))

def trim(v):
    # string arithmetic only: no context, no rounding
    neg = v.startswith('-'); body = v[1:] if neg else v
    i, _, f = body.partition('.')
    i = i.lstrip('0') or '0'; f = f.rstrip('0')
    s = i + ('.' + f if f else '')
    return '-' + s if neg and s != '0' else s
def inst(v):
    # independent: python fromisoformat, keep given micro digits
    base, frac_off = v[:19], v[19:]
    frac = ""
    if frac_off.startswith('.'):
        i = 1
        while frac_off[i].isdigit(): i += 1
        frac, off = frac_off[1:i], frac_off[i:]
    else: off = frac_off
    dt = datetime.datetime.fromisoformat(base + (off.replace('Z','+00:00')))
    u = dt.astimezone(datetime.timezone.utc)
    return u.strftime('%Y-%m-%dT%H:%M:%S') + '.' + frac.ljust(6,'0') + 'Z'
def canon(x):
    links = sorted(x['links'], key=lambda l: int(l['meeting']))
    # bytewise order on ASCII fields; a null start sorts before any start of the same end
    obs = sorted(x['observations'], key=lambda o: (o['periodEnd'].encode(), o['periodStart'] is not None, (o['periodStart'] or '').encode()))
    lines = ["market-canonical.v2", f"source-revision:{x['sourceRevisionId']}", f"series-contract:{x['seriesContract']['id']}@{x['seriesContract']['sha256']}",
      f"parser:{x['parser']}", f"quality-policy:{x['qualityPolicy']['id']}@{x['qualityPolicy']['version']}", f"availability:{x['availabilityBasis']}",
      "inputs:" + ",".join("a:"+a for a in sorted(x['acquisitionIds'], key=lambda a: a.encode())), f"supersedes:{x['supersedes'] or 'null'}", "links:"]
    lines += [f"{l['meeting']}|{l['referenceDate']}|{l['decision']}|{trim(l['targetPct'])}|{l['recordSha256']}|{l['acquisitionId']}" for l in links]
    lines += ["observations:"]
    lines += ["|".join([o['periodStart'] or '', o['periodEnd'], inst(o['availableAt']), inst(o['acquiredAt']), trim(o['value']), o['unit'], o['scale']]) for o in obs]
    return "\n".join(lines)

REV="6f1c2a40-8d3e-4b7a-9c11-2e5f8a9b0c01"; ACQ="0b7d3e52-1a4c-4e8f-b2d6-9c0a1e3f5b72"; ACQ2="0b7d3e52-1a4c-4e8f-b2d6-9c0a1e3f5b71"
CACQ="9e2b4c61-7d8a-4f3e-a5b9-1c2d3e4f5a60"; CACQ2="9e2b4c61-7d8a-4f3e-a5b9-1c2d3e4f5a61"; SUP="3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f"
R281=sha("synthetic-record-281"); R280=sha("synthetic-record-280")
def ob(p,v,t="2026-10-21T15:04:05.123456Z"): return {"periodStart":None,"periodEnd":p,"availableAt":t,"acquiredAt":t,"value":v,"unit":"percent_per_year","scale":"1"}
base = {"sourceRevisionId":REV,"seriesContract":{"id":"bcb-sgs-432","sha256":CONTRACT_SHA},"parser":"bcb-sgs-daily-json.v2",
  "qualityPolicy":{"id":"bcb-sgs-432-quality","version":"v2"},"availabilityBasis":"observed_at_acquisition","acquisitionIds":[ACQ],"supersedes":None,
  "links":[{"meeting":281,"referenceDate":"2026-09-16","decision":"cut","targetPct":"13.75","recordSha256":R281,"acquisitionId":CACQ}],
  "observations":[ob("2026-09-16","14.00"),ob("2026-09-17","13.75"),ob("2026-09-18","13.75")]}
import copy
c2 = copy.deepcopy(base)
for o in c2['observations']: o['availableAt']=o['acquiredAt']="2026-10-21T12:04:05.123456-03:00"
c3 = copy.deepcopy(base); c3['observations']=[ob("2026-09-16","014.000"),ob("2026-09-17","0.50"),ob("2026-09-18","100.00"),ob("2026-09-19","-0.00")]
c4 = copy.deepcopy(base); c4['acquisitionIds']=[ACQ,ACQ2]; c4['supersedes']=SUP
c4['links']=[base['links'][0],{"meeting":280,"referenceDate":"2026-08-05","decision":"cut","targetPct":"14","recordSha256":R280,"acquisitionId":CACQ2}]
c4['observations']=[ob("2026-09-18","13.75","2026-10-21T15:04:05Z"),ob("2026-08-06","14.00","2026-10-21T15:04:05.1Z"),ob("2026-08-05","14.25","2026-10-21T15:04:05.000001Z")]
c5 = copy.deepcopy(base); c5['links']=[]
c6 = copy.deepcopy(base); c6['observations']=[ob("2026-09-16","123456789012345678901234.12345678901234567890"),ob("2026-09-17","0.00000000000000000001"),ob("2026-09-18","-0.10000000000000000000")]
c7 = copy.deepcopy(base)
c7['observations']=[dict(ob("2026-09-30","1.00"),periodStart="2026-09-01"),ob("2026-09-30","2.00"),dict(ob("2026-09-30","3.00"),periodStart="2026-09-15")]
c8 = copy.deepcopy(base); c8['acquisitionIds']=["f0000000-0000-4000-8000-000000000000","0fffffff-ffff-4fff-bfff-ffffffffffff","a0000000-0000-4000-8000-000000000000"]
c8['links']=[dict(base['links'][0],meeting=1000),dict(base['links'][0],meeting=99),dict(base['links'][0],meeting=281)]
c9 = copy.deepcopy(base); c9['observations']=[ob("2026-09-16","14.00","2026-10-21T23:30:00.5-03:00"),ob("2026-09-17","13.75","2026-12-31T22:00:00.000001-03:00")]
c10 = copy.deepcopy(base); c10['links']=[]; c10['observations']=[]
cases=[("basic",base),("offset_instants_normalise",c2),("trimmed_decimals",c3),("reprocess_sorted_lists",c4),("no_links",c5),
 ("precision_limits",c6),("null_start_sorts_first",c7),("bytewise_uuid_and_numeric_meeting_order",c8),("offset_crosses_utc_date_and_year",c9),("empty_lists",c10)]
canon_vectors=[{"name":n,"input":x,"canonical":canon(x),"sha256":sha(canon(x))} for n,x in cases]
assert canon_vectors[0]['canonical']==canon_vectors[1]['canonical']
def bad(name, mut, code):
    x=copy.deepcopy(base); mut(x); return {"name":name,"input":x,"error":code}
neg=[bad("exponent_value",lambda x:x['observations'][0].update(value="1e3"),"canonical_decimal"),
 bad("seven_fraction_digits",lambda x:x['observations'][0].update(acquiredAt="2026-10-21T15:04:05.1234567Z"),"canonical_instant"),
 bad("uppercase_uuid",lambda x:x.update(sourceRevisionId=REV.upper()),"canonical_source_revision"),
 bad("repeated_period",lambda x:x['observations'].append(ob("2026-09-16","14.00")),"canonical_period_repeated"),
 bad("repeated_meeting",lambda x:x['links'].append(dict(x['links'][0])),"canonical_link_repeated"),
 bad("other_availability",lambda x:x.update(availabilityBasis="official_publication"),"canonical_availability"),
 bad("no_inputs",lambda x:x.update(acquisitionIds=[]),"canonical_inputs"),
 bad("instant_without_offset",lambda x:x['observations'][0].update(acquiredAt="2026-10-21T15:04:05.123456"),"canonical_instant"),
 bad("invalid_hour",lambda x:x['observations'][0].update(acquiredAt="2026-10-21T24:00:00Z"),"canonical_instant"),
 bad("invalid_date",lambda x:x['observations'][0].update(periodEnd="2026-02-30"),"canonical_observation")]

# ---- availability limits, independent via zoneinfo
def limit(d):
    nxt = datetime.date.fromisoformat(d)+datetime.timedelta(1)
    # first instant whose local date >= nxt: scan by minute from UTC midnight
    t = datetime.datetime(nxt.year,nxt.month,nxt.day,tzinfo=datetime.timezone.utc)
    while t.astimezone(SP).date() < nxt: t += datetime.timedelta(minutes=1)
    # step back by ms precision check
    assert (t-datetime.timedelta(milliseconds=1)).astimezone(SP).date() < nxt
    return t.strftime('%Y-%m-%dT%H:%M:%S.000Z')
lim=[{"dataBase":d,"limit":limit(d)} for d in ["2026-10-21","2024-12-31","2018-11-03","2019-02-15","2019-02-16","2021-01-14"]]
elig=[{"dataBase":"2026-10-21","acquiredAt":"2026-10-21T23:59:59.999-03:00","eligible":True},
      {"dataBase":"2026-10-21","acquiredAt":"2026-10-22T00:00:00.000-03:00","eligible":False},
      {"dataBase":"2026-10-20","acquiredAt":"2026-10-21T02:59:59.999Z","eligible":True},
      {"dataBase":"2026-10-20","acquiredAt":"2026-10-21T03:00:00.000Z","eligible":False},
      {"dataBase":"2019-02-16","acquiredAt":"2019-02-17T02:30:00.000Z","eligible":True}]
for e in elig:
    a=datetime.datetime.fromisoformat(e['acquiredAt'].replace('Z','+00:00'))
    L=datetime.datetime.fromisoformat(limit(e['dataBase']).replace('Z','+00:00'))
    assert (a<L)==e['eligible'], e
REC={"nro_reuniao":281,"dataReferencia":"2026-09-16","titulo":"281ª reunião - Copom reduz a taxa Selic para  13,75% a.a.","textoComunicado":"<p>a</p>"}
rec_text="\n".join(["copom-communique-record.v1",f"meeting:{REC['nro_reuniao']}",f"reference:{REC['dataReferencia']}",
  f"title:{len(REC['titulo'].encode())}:{REC['titulo']}",f"text:{len(REC['textoComunicado'].encode())}:{REC['textoComunicado']}"])
out={"schemaVersion":"offroad.market-m2-vectors.v1","generatedBy":"independent Python implementation (zoneinfo, decimal), 21/10/2026",
 "seriesContractSha256":CONTRACT_SHA,"canonicalV2":canon_vectors,"canonicalV2Refusals":neg,"dataBaseLimits":lim,"eligibility":elig,"communiqueRecords":[{"record":REC,"sha256":sha(rec_text)}]}
json.dump(out,open(sys.argv[1],'w'),ensure_ascii=False,indent=1); open(sys.argv[1],'a').write("\n")
