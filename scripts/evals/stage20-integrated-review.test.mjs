import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {validateTarget, validateFixture, humanReviewManifest, checkedRelease, authorizedPendingReview} from './stage20-integrated-review.mjs';

test('only a complete loopback pair or the explicitly selected staging project is admitted', () => {
  assert.equal(validateTarget('http://127.0.0.1:54321', 'postgresql://postgres:local@127.0.0.1:54322/postgres'), 'loopback');
  assert.equal(validateTarget('https://gjkkjtbfnssdsbmlhmwk.supabase.co', 'postgresql://postgres:local@db.gjkkjtbfnssdsbmlhmwk.supabase.co/postgres', 'gjkkjtbfnssdsbmlhmwk'), 'staging');
  for (const [api,db,selection] of [
    ['https://production.supabase.co','postgresql://postgres@db.production.supabase.co/postgres','gjkkjtbfnssdsbmlhmwk'],
    ['https://gjkkjtbfnssdsbmlhmwk.supabase.co','postgresql://postgres@db.gjkkjtbfnssdsbmlhmwk.supabase.co/postgres',undefined],
    ['http://127.0.0.1:54321','postgresql://postgres@db.production.supabase.co/postgres',undefined],
    ['https://gjkkjtbfnssdsbmlhmwk.supabase.co','postgresql://postgres@pooler.supabase.com/postgres','gjkkjtbfnssdsbmlhmwk'],
    ['http://user:pass@127.0.0.1:54321','postgresql://postgres@localhost/postgres',undefined],
    ['http://127.0.0.1:54321/other','postgresql://postgres@localhost/postgres',undefined],
    ['http://127.0.0.1:54321?redirect=example.com','postgresql://postgres@localhost/postgres',undefined],
  ]) assert.throws(() => validateTarget(api,db,selection));
});
test('fixture carries exact physical target and two different humans, never permissions', () => {
  const f={schemaVersion:'stage20-integrated-review-fixture.v1',namespace:randomUUID(),organizationId:randomUUID(),workId:randomUUID(),artifactId:randomUUID(),revisionId:randomUUID(),recipeId:randomUUID(),retainedPayloadId:randomUUID(),ownerId:randomUUID(),reviewerId:randomUUID(),cleanupOwner:'stage20 integration'};
  assert.equal(validateFixture(f),f);
  assert.throws(()=>validateFixture({...f,reviewerId:f.ownerId}));
  assert.throws(()=>validateFixture({...f,workId:"';delete from public.capital_projects;--"}));
  assert.throws(()=>validateFixture({...f,accepted:true}));
  assert.throws(()=>validateFixture({...f,cleanupOwner:''}));
});


test('material fixture is explicit; preview v1 remains closed and unchanged',()=>{
 const f={schemaVersion:'stage20-integrated-review-fixture.v2',nativeKind:'material',namespace:randomUUID(),organizationId:randomUUID(),workId:randomUUID(),artifactId:randomUUID(),revisionId:randomUUID(),recipeId:randomUUID(),retainedPayloadId:randomUUID(),ownerId:randomUUID(),reviewerId:randomUUID(),cleanupOwner:'stage20 integration'};
 assert.equal(validateFixture(f),f);assert.throws(()=>validateFixture({...f,nativeKind:'preview'}));assert.throws(()=>validateFixture({...f,schemaVersion:'stage20-integrated-review-fixture.v1'}));
 assert.equal(validateTarget('https://gjkkjtbfnssdsbmlhmwk.supabase.co',undefined,'gjkkjtbfnssdsbmlhmwk',true),'staging');
 for(const api of['https://production.supabase.co','http://127.0.0.1:54321','https://gjkkjtbfnssdsbmlhmwk.supabase.co/other'])assert.throws(()=>validateTarget(api,undefined,'gjkkjtbfnssdsbmlhmwk',true));
 assert.throws(()=>validateTarget('https://gjkkjtbfnssdsbmlhmwk.supabase.co','postgresql://postgres:secret@db.gjkkjtbfnssdsbmlhmwk.supabase.co/postgres','gjkkjtbfnssdsbmlhmwk',true));
});

test('authored revision manifest pins each actual template instead of reusing a replay fingerprint',()=>{
 const first=humanReviewManifest('synthetic-review-start');
 const layout=humanReviewManifest('synthetic-review-layout');
 const material=humanReviewManifest('synthetic-review-material');
 const pending=humanReviewManifest('synthetic-review-pending');
 assert.deepEqual(first, humanReviewManifest('synthetic-review-start'));
 assert.equal(new Set([first,layout,material,pending].map(v=>JSON.stringify(v))).size,4);
 assert.deepEqual(first.template,{templateVersionId:'synthetic-review-start',fingerprint:'1'.repeat(64)});
 for(const key of Object.keys(first).filter(v=>v!=='template'))assert.deepEqual(first[key],layout[key]);
 assert.deepEqual(first.sources,[]);assert.deepEqual(first.claims,[]);assert.equal(first.execution,null);assert.equal(first.bytes,null);
 assert.throws(()=>humanReviewManifest(''));assert.throws(()=>humanReviewManifest('x'.repeat(201)));
});

test('release assertions preserve their exact requirement and reject unexpected values',()=>{
 assert.doesNotThrow(()=>checkedRelease('internal','internal','r2_before_reaffirm'));
 assert.doesNotThrow(()=>checkedRelease('released','released','r2_after_reaffirm'));
 assert.throws(()=>checkedRelease('internal','released','r2_after_reaffirm'));
 assert.throws(()=>checkedRelease({private:'secret'},'released','r2_after_reaffirm'));
});

test('review state comes from the authorized computed dashboard and remains pinned to the exact target',()=>{
 const target={revision_id:randomUUID(),artifact_id:randomUUID(),manifest_fingerprint:'1'.repeat(64)},work=randomUUID();
 const row={revisionId:target.revision_id,artifactId:target.artifact_id,manifestFingerprint:target.manifest_fingerprint,withheld:false,pending:true};
 const dashboard={schemaVersion:'work-review-dashboard.v1',workId:work,revisions:[row]};
 assert.equal(authorizedPendingReview(dashboard,target,work),true);
 assert.equal(authorizedPendingReview({...dashboard,revisions:[{...row,pending:false}]},target,work),false);
 assert.throws(()=>authorizedPendingReview({...dashboard,workId:randomUUID()},target,work));
 for(const change of [{withheld:true},{revisionId:randomUUID()},{artifactId:randomUUID()},{manifestFingerprint:'2'.repeat(64)},{pending:null}])assert.throws(()=>authorizedPendingReview({...dashboard,revisions:[{...row,...change}]},target,work));
});

test('network origins are selected from trusted literal enums, with no file-supplied destination',async()=>{
 const{reviewNetworkOrigin,selectReviewNetworkOrigin}=await import('./stage20-integrated-review.mjs');
 for(const[selection,url,target]of[
  ['staging','https://gjkkjtbfnssdsbmlhmwk.supabase.co','staging'],
  ['loopback_ipv4','http://127.0.0.1:54321','loopback'],
  ['loopback_localhost','http://localhost:54321','loopback'],
  ['loopback_ipv6','http://[::1]:54321','loopback'],
 ]){assert.equal(reviewNetworkOrigin(selection),url);assert.equal(selectReviewNetworkOrigin(url,target),url);assert.equal(selectReviewNetworkOrigin(url+'/',target),url);}
 for(const selection of['https://attacker.example','production','loopback',null,{url:'https://attacker.example'}])assert.throws(()=>reviewNetworkOrigin(selection));
 for(const url of['https://attacker.example','https://production.supabase.co','http://127.0.0.1:54322','http://127.0.0.1:54321/other','http://127.0.0.1:54321?redirect=attacker','http://user:secret@127.0.0.1:54321'])assert.throws(()=>selectReviewNetworkOrigin(url,'loopback'));
 // Compatibility is deliberately narrower than general target pairing: this eval owns port54321 only.
 assert.equal(validateTarget('http://127.0.0.1:54322','postgresql://postgres:local@127.0.0.1:54323/postgres'),'loopback');
 assert.throws(()=>selectReviewNetworkOrigin('http://127.0.0.1:54322','loopback'),/review_network_origin_denied/);
 assert.throws(()=>selectReviewNetworkOrigin('https://attacker.example','staging'));
 assert.throws(()=>selectReviewNetworkOrigin('http://127.0.0.1:54321','staging'));
});
