import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {validateTarget, validateFixture} from './stage20-integrated-review.mjs';

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
