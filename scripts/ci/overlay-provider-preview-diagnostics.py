import pathlib,json,hashlib
runtime=pathlib.Path.cwd();audit=runtime.parent/'audit'
m=json.loads((audit/'DIAGNOSTIC-OVERLAYS.json').read_text());assert m['runtimeHead']=='afe390635f7cf94147b237dd3afaf5cb11a73fd2'
allowed={'apps/document-worker/src/capital-native-provider-adapter.ts','apps/document-worker/src/capital-native-provider-adapter.test.ts','apps/document-worker/scripts/capital-native-provider-sdk-eval.ts','apps/document-worker/scripts/capital-preview-native-sdk-eval.ts','supabase/tests/support/work_review_dashboard.sql'}
assert {x['path']for x in m['files']}==allowed
for x in m['files']:
 dest=runtime/x['path'];source=audit/x['path'];assert hashlib.sha256(dest.read_bytes()).hexdigest()==x['baseSha256'];assert hashlib.sha256(source.read_bytes()).hexdigest()==x['sha256'];dest.write_bytes(source.read_bytes())
print('Five exact diagnostic/fixture overlays validated; no release claim')
