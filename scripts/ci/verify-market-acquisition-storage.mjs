// Disposable localhost stack only. The market acquisition job end to end through the real Storage API:
// a synthetic worker account, signed in with its own session and delegated for one synthetic source,
// claims through the worker's own queue, stores the bytes with a single-request upload and sends them to
// the confirmation; the database checks them against the size, type and MD5 that Storage recorded and
// reads them under the endpoint contract into a version. The bytes are a valid SGS 432 window padded
// with JSON whitespace to just under the single-request limit, so the upload and the hexadecimal
// transport of the confirmation are both proven at full size. Then the negatives through the same
// API: an undelegated worker cannot upload to an allocated path, the delegated worker cannot download
// market bytes or delete a confirmed object, and the bytes of a cancelled attempt are swept with the
// batch removal route. The file never comes from the network: the fetch is replaced by fixed bytes.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync, rmSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const local = ['localhost', '127.0.0.1', '[::1]'];
const database = new URL(process.env.OFFROAD_E2E_DATABASE_URL ?? 'invalid:');
assert(['postgres:', 'postgresql:'].includes(database.protocol) && local.includes(database.hostname) && !database.search && !database.hash, 'local_database_required');
const api = new URL(process.env.OFFROAD_E2E_API_URL || 'invalid:');
assert(['http:', 'https:'].includes(api.protocol) && local.includes(api.hostname) && (api.pathname === '/' || api.pathname === '') && !api.search && !api.hash, 'local_api_required');
const publishableKey = process.env.OFFROAD_E2E_PUBLISHABLE_KEY ?? '';
assert(publishableKey.length > 0, 'local_publishable_key_required');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
const sql = query => {
  try { return execFileSync('psql', ['--dbname', database.href, '--no-psqlrc', '-v', 'ON_ERROR_STOP=1', '-Atq'], {input: query, env, encoding: 'utf8', timeout: 60000, stdio: ['pipe', 'pipe', 'pipe']}).trim(); }
  catch (error) { throw new Error('market_storage_sql_failed: ' + String(error.stderr ?? '').slice(-2000)); }
};

const prefix = '3a770000';
const id = (group, n) => `${prefix}-0000-4000-${group}-${String(n).padStart(12, '0')}`;
const users = {founder: id('8000', 1), operator: id('8000', 2), workerA: id('8000', 3), workerB: id('8000', 4)};
const tokens = {a: `synthetic-market-storage-token-${prefix}-a`, b: `synthetic-market-storage-token-${prefix}-b`};
const password = 'Synthetic-Market-Storage!2026';
const source = 'bcb';
const md5 = bytes => createHash('md5').update(bytes).digest('hex');

const workerRequire = createRequire(join(root, 'apps/document-worker/package.json'));
const {build} = workerRequire('esbuild');
const {createClient} = workerRequire('@supabase/supabase-js');
const temporary = mkdtempSync(join(tmpdir(), 'offroad-market-storage-proof-'));
try {
  const outfile = join(temporary, 'consumer.mjs');
  await build({stdin: {contents: `export {createMarketAcquisitionQueue} from './src/market-acquisition-queue.ts';
export {processMarketAcquisition, sweepMarketOrphans} from './src/process-market-acquisition.ts';
export {createMarketObjectStore} from './src/market-acquisition-storage.ts';`, resolveDir: join(root, 'apps/document-worker'), loader: 'ts'},
   outfile, bundle: true, platform: 'node', format: 'esm', target: 'node24', logLevel: 'silent'});
  const m = await import(pathToFileURL(outfile));

  sql(`begin;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous,instance_id,email_confirmed_at,
 confirmation_token,recovery_token,email_change_token_new,email_change,encrypted_password)
select ('${prefix}-0000-4000-8000-00000000000'||n)::uuid,'authenticated','authenticated','${prefix}-'||n||'@example.invalid','{"provider":"email","providers":["email"]}','{}',now(),now(),
 false,false,'00000000-0000-0000-0000-000000000000',now(),'','','','',extensions.crypt('${password}',extensions.gen_salt('bf')) from generate_series(1,4) n;
insert into auth.identities(id,user_id,provider_id,provider,identity_data,created_at,updated_at)
select gen_random_uuid(),id,id::text,'email',jsonb_build_object('sub',id::text,'email',email),now(),now() from auth.users where id in ('${users.workerA}','${users.workerB}');
insert into private.platform_principals(user_id,role,label) values('${users.founder}','founder','Synthetic storage founder'),('${users.operator}','operator','Synthetic storage operator');
insert into private.worker_tokens(id,label,token_sha256,execution_account_user_id) values
 ('${id('8000', 11)}','Synthetic storage worker A',extensions.digest('${tokens.a}','sha256'),'${users.workerA}'),
 ('${id('8000', 12)}','Synthetic storage worker B',extensions.digest('${tokens.b}','sha256'),'${users.workerB}');
do $$ begin
 if private.market_publisher_organization_v1() is null then
  perform private.register_market_publisher_v1('${id('a000', 1)}','Offroad, referência de mercado','${users.founder}');
 end if;
end $$;
select private.record_market_source_revision_v1('${id('a000', 2)}','${source}',jsonb_build_object('registryId','bcb_sgs','license',jsonb_build_object('kind','open',
 'license','ODbL-1.0','attribution','Banco Central do Brasil','evidenceIds',jsonb_build_array('bcb-catalog-meta-selic-432','bcb-catalog-atas-comunicados-copom',
 'bcb-site-termos-de-uso'),'retainAdoptedValues',true,'storeDays',null),'allowedHosts',jsonb_build_array('api.bcb.gov.br','www.bcb.gov.br'),'calendar','br_business_days',
 'expectedPublication','09:00','maximumAgeHours',30,'enabled',true,'reason','Fonte sintética da prova de Storage'),'${users.operator}');
select private.grant_market_acquisition_delegation_v1('${id('a000', 3)}','${id('8000', 11)}','${source}','Synthetic storage delegation A','${users.operator}');
select private.release_market_acquisition_transport_v1('${id('a000', 4)}',true,'${users.operator}','Synthetic opening for the storage proof');
-- Jobs that earlier CI steps left open would be claimed first; they are cancelled.
do $$ declare j uuid;begin
 for j in select id from private.market_acquisition_jobs where status in ('queued','leased') loop
  perform private.cancel_market_acquisition_v1(gen_random_uuid(),j,'Synthetic cleanup before the storage proof','${users.operator}');
 end loop;
end $$;
select private.enqueue_market_contract_acquisition_v1('${id('a000', 5)}','bcb-sgs-432-endpoint','{"window":{"start":"2025-09-17","end":"2025-09-20"}}',
 'Aquisição sintética da prova de Storage','${users.operator}');
commit;`);

  const session = async n => {
    const client = createClient(api.origin, publishableKey, {auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false}});
    const {error} = await client.auth.signInWithPassword({email: `${prefix}-${n}@example.invalid`, password});
    assert.equal(error, null, `sign_in_failed_${n}`);
    return client;
  };
  const workerA = await session(3), workerB = await session(4);
  const queueA = m.createMarketAcquisitionQueue(workerA, tokens.a), queueB = m.createMarketAcquisitionQueue(workerB, tokens.b);
  const storeA = m.createMarketObjectStore(workerA), storeB = m.createMarketObjectStore(workerB);

  // 1. Positive: a single-request upload just under the attempt limit, confirmed by Storage's own MD5.
  assert.equal(await queueB.claim(), null, 'undelegated worker claimed');
  const claim = await queueA.claim();
  assert(claim, 'delegated worker could not claim');
  const rows = ['17', '18', '19', '20'].map(day => `{"data":"${day}/09/2025","valor":"15.00"}`).join(',');
  const bytes = Buffer.from('[' + rows + ' '.repeat(4_600_000) + ']');
  assert(bytes.length < 5 * 1024 * 1024 && bytes.length > 4 * 1024 * 1024, 'fixture size');
  const fetch = async () => ({finalUrl: claim.url, bytes, sha256: createHash('sha256').update(bytes).digest('hex'), md5: md5(bytes), byteSize: bytes.length,
    contentType: 'application/json', acquiredAt: new Date()});
  // The undelegated worker cannot write to the allocated path through the API.
  await assert.rejects(storeB.upload(claim.objectPath, Buffer.from('[0]'), 'application/json'), 'undelegated upload accepted');
  const result = await m.processMarketAcquisition(claim, queueA, storeA, new AbortController().signal, {fetch});
  assert.equal(result.status, 'committed', 'acquisition not committed: ' + JSON.stringify(result));
  assert.equal(sql(`select count(*) from private.market_versions v join private.market_observations o on o.version_id=v.id
   where v.id='${result.versionId}' and v.canonical_version='v2' and v.normalization_id='bcb-sgs-432';`), '4', 'version not read from the stored bytes');
  assert.equal(sql(`select count(*) from private.market_acquisitions where object_path='${claim.objectPath}' and byte_size=${bytes.length} and content_type='application/json';`), '1');
  assert.equal(sql(`select metadata->>'eTag' from storage.objects where bucket_id='market-reference' and name='${claim.objectPath}';`), `"${md5(bytes)}"`, 'Storage eTag is not the MD5');
  // No download, no deletion of a confirmed object.
  const {error: downloadError} = await workerA.storage.from('market-reference').download(claim.objectPath);
  assert(downloadError, 'the worker downloaded market bytes');
  await storeA.remove([claim.objectPath]).catch(() => undefined);
  assert.equal(sql(`select count(*) from storage.objects where bucket_id='market-reference' and name='${claim.objectPath}';`), '1', 'confirmed object deleted');

  // 2. The bytes of a cancelled attempt are swept through the batch removal route.
  sql(`select private.enqueue_market_contract_acquisition_v1('${id('a000', 6)}','bcb-copom-comunicados-lista','{"size":5}','Segunda aquisição sintética da prova','${users.operator}');`);
  const second = await queueA.claim();
  assert(second, 'second claim');
  await storeA.upload(second.objectPath, Buffer.from('[2]'), 'application/json');
  sql(`select private.cancel_market_acquisition_v1('${id('a000', 7)}','${second.jobId}','Synthetic cancellation for the sweep proof','${users.operator}');`);
  assert.equal(await m.sweepMarketOrphans(queueB, storeB), 0, 'undelegated worker swept');
  assert.equal(sql(`select count(*) from storage.objects where bucket_id='market-reference' and name='${second.objectPath}';`), '1');
  assert.equal(await m.sweepMarketOrphans(queueA, storeA), 1, 'orphan not swept');
  assert.equal(sql(`select count(*) from storage.objects where bucket_id='market-reference' and name='${second.objectPath}';`), '0', 'orphan still stored');

  sql(`select private.release_market_acquisition_transport_v1('${id('a000', 8)}',false,'${users.operator}','Synthetic closing after the storage proof');`);
  console.log('PASS: market acquisition through the real Storage API: delegated upload, confirmation with the bytes read into a version, closed download and deletion, sweep');
} finally {
  rmSync(temporary, {recursive: true, force: true});
}
