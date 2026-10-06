#!/usr/bin/env python3
"""Fail closed on unreviewed production entrypoints, RPC consumers and technical imports.

Database object/policy/grant decisions are independently checked against a real replay by
check-stage0-inventory.py. This complementary gate covers repository consumers and routes.
"""
import hashlib,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
MANIFEST=ROOT/'docs/build/arcabouco/framework-consumer-surface.json'
RPC=re.compile(r'(?:\.rpc|\bcall|\brpc)\s*\(\s*[\"\']([a-z][a-z0-9_]+)[\"\']')
TECHNICAL=('testing/','test-support','universal-dispatch-runtime','integration-preview','live-preview')

def production_files(root):
    return {str(p.relative_to(root)):p.read_text() for app in ['apps/web/src','apps/document-worker/src'] for p in (root/app).rglob('*.ts*') if p.is_file() and not any(x in str(p.relative_to(root)) for x in ['.test.','.test-support.','/testing/'])}

def surface(root=ROOT):
    rows={}
    for path,text in production_files(root).items():
        route=Path(path).name in ('route.ts','actions.ts','actions.tsx') or re.search(r'^[\"\']use server[\"\']',text)
        names=sorted(set(RPC.findall(text)))
        if route or names or '.rpc(' in text:
            rows[path]={'sha256':hashlib.sha256(text.encode()).hexdigest(),'entrypoint':bool(route),'rpcs':names}
    return rows

def check(manifest,root=ROOT):
    errors=[];actual=surface(root);reviewed={x['path']:x for x in manifest['consumers']}
    if len(reviewed)!=len(manifest['consumers']):errors.append('duplicate_consumer')
    for path,item in actual.items():
        expected=reviewed.get(path)
        if expected is None:errors.append('unclassified_consumer:'+path);continue
        if any(expected.get(k)!=v for k,v in item.items()):errors.append('consumer_changed_without_review:'+path)
        if not expected.get('authority')or not expected.get('decision')or not expected.get('negativeTests'):errors.append('incomplete_consumer_review:'+path)
        for test in expected.get('negativeTests',[]):
            if not(root/test).is_file():errors.append('missing_access_test:'+test)
    for path in reviewed.keys()-actual.keys():errors.append('removed_consumer_without_disposition:'+path)
    inventory=json.loads((root/'docs/build/arcabouco-stage0/object-decisions.json').read_text())
    known={x.get('catalogues',{}).get('production',{}).get('name') for x in inventory['objects'] if x['kind']=='function'}
    for path,item in actual.items():
        for name in item['rpcs']:
            if name not in known:errors.append('unclassified_rpc:'+path+':'+name)
    for path,text in production_files(root).items():
        import_text=re.sub(r'import\s+type\s+[^;]+;', '', text)
        for imp in re.findall(r'(?:from\s*|import\s*\(|import\s*)[\"\']([^\"\']+)[\"\']',import_text):
            if any(token in imp for token in (TECHNICAL if path.startswith('apps/document-worker/') else TECHNICAL[:2])) and path not in manifest['isolatedTechnicalModules']:
                errors.append('technical_module_in_production:'+path+':'+imp)
    main=production_files(root)['apps/document-worker/src/main.ts']
    if 'rejectRetiredFrameworkJob(job, queue)'not in main:errors.append('retired_dispatch_barrier_missing')
    if main.find('rejectRetiredFrameworkJob(job, queue)')>main.find('research = await researchFor(job)'):errors.append('retired_dispatch_barrier_after_gateway')
    return errors

if __name__=='__main__':
    errors=check(json.loads(MANIFEST.read_text()));print(json.dumps({'consumers':len(surface()),'errors':errors}));raise SystemExit(bool(errors))
