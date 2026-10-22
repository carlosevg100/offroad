import {execFileSync, spawn} from "node:child_process";
import {createHash} from "node:crypto";
import {expect, test} from "@playwright/test";

// The ODbL edition of the derived SGS 432 database (ADR 0023, M2 part 3) on the local stack: no page and no
// file before an edition, both served after a founder publishes one, both gone after a withdrawal, all
// without a new deploy. Every row here is synthetic, dated in 2025, in the disposable local database.
test.describe.configure({mode: "serial"});
const databaseUrl = process.env.OFFROAD_E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function sql(query: string): string {
  if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(databaseUrl).hostname)) throw new Error("ODbL E2E requires the local database.");
  return execFileSync("psql", [databaseUrl, "-At", "-v", "ON_ERROR_STOP=1", "-q"], {input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"]}).trim();
}

const P = "3a7c0000";
const id = (group: string, n: number) => `${P}-0000-4000-${group}-${String(n).padStart(12, "0")}`;
const founder = id("8000", 1), operator = id("8000", 2), worker = id("8000", 4), token = `synthetic-odbl-e2e-token-${P}`;

// One committed setup and three acquisitions (two communiqués, then the series they explain), as the worker
// would confirm them, then the first edition. Guarded so a retried run finds the same state.
const seed = `
begin;
select set_config('request.jwt.claims','{}',true);
do $seed$ begin
 if exists(select 1 from private.market_odbl_releases) then return;end if;
 insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
 select ('${P}-0000-4000-8000-00000000000'||n)::uuid,'authenticated','authenticated','${P}-'||n||'@example.invalid','{}','{}',now(),now(),false,false
 from unnest(array[1,2,4]) n on conflict do nothing;
 insert into private.platform_principals(user_id,role,label) values('${founder}','founder','Synthetic ODbL E2E founder'),('${operator}','operator','Synthetic ODbL E2E operator')
 on conflict do nothing;
 insert into private.worker_tokens(id,label,token_sha256,execution_account_user_id)
 values('${id("8000", 11)}','Synthetic ODbL E2E worker',extensions.digest('${token}','sha256'),'${worker}') on conflict do nothing;
 if private.market_publisher_organization_v1() is null then
  perform private.register_market_publisher_v1('${id("a000", 1)}','Offroad, referência de mercado','${founder}');
 end if;
 perform private.record_market_source_revision_v1('${id("a000", 2)}','bcb',jsonb_build_object('registryId','bcb_sgs','license',jsonb_build_object('kind','open',
  'license','ODbL-1.0','attribution','Banco Central do Brasil','evidenceIds',jsonb_build_array('bcb-catalog-meta-selic-432','bcb-catalog-atas-comunicados-copom',
  'bcb-site-termos-de-uso'),'retainAdoptedValues',true,'storeDays',null),'allowedHosts',jsonb_build_array('api.bcb.gov.br','www.bcb.gov.br'),'calendar','br_business_days',
  'expectedPublication','09:00','maximumAgeHours',30,'enabled',true,'reason','Fonte sintética da prova ODbL'),'${operator}');
 perform private.release_market_acquisition_transport_v1('${id("a000", 3)}',true,'${operator}','Synthetic opening for the ODbL proof');
 perform private.grant_market_acquisition_delegation_v1('${id("a000", 4)}','${id("8000", 11)}','bcb','Synthetic delegation for the ODbL proof','${operator}');
end $seed$;
create function pg_temp.run(p_command uuid,p_contract text,p_request jsonb,p_content bytea) returns void language plpgsql as $f$
declare c jsonb;begin
 update private.market_acquisition_jobs set available_at=clock_timestamp()+interval '1 day' where status='queued';
 perform private.enqueue_market_contract_acquisition_v1(p_command,p_contract,p_request,'Aquisição sintética da prova ODbL','${operator}');
 perform set_config('request.jwt.claim.sub','${worker}',true);
 c:=private.worker_claim_market_acquisition_v1('${token}');
 perform set_config('request.jwt.claim.sub','',true);
 if (c->>'claimed')::boolean is not true then raise exception 'claim failed: %',c;end if;
 insert into storage.objects(bucket_id,name,metadata,version) values('market-reference',c->>'objectPath',
  jsonb_build_object('size',octet_length(p_content),'mimetype','application/json','eTag','"'||md5(p_content)||'"'),'market-odbl-e2e');
 perform set_config('request.jwt.claim.sub','${worker}',true);
 perform private.worker_commit_market_version_v1((c->>'jobId')::uuid,c->>'capability',(c->>'leaseId')::uuid,p_content,'application/json',clock_timestamp());
 perform set_config('request.jwt.claim.sub','',true);
end $f$;
do $seed$ begin
 if exists(select 1 from private.market_odbl_releases) then return;end if;
 perform pg_temp.run('${id("a000", 11)}','bcb-copom-comunicados-detalhe','{"meeting":9101}',convert_to('{"conteudo":[{"nro_reuniao":9101,"dataReferencia":"2025-09-16","titulo":"Copom mantém a taxa Selic em 15,00% a.a.","textoComunicado":"<p>O Copom decidiu manter a taxa Selic em 15,00% a.a.</p>"}]}','UTF8'));
 perform pg_temp.run('${id("a000", 12)}','bcb-copom-comunicados-detalhe','{"meeting":9102}',convert_to('{"conteudo":[{"nro_reuniao":9102,"dataReferencia":"2025-10-07","titulo":"Copom reduz a taxa Selic para 14,50% a.a.","textoComunicado":"<p>O Copom decidiu reduzir a taxa Selic em 0,50 ponto percentual, para 14,50% a.a.</p>"}]}','UTF8'));
 perform pg_temp.run('${id("a000", 13)}','bcb-sgs-432-endpoint','{"window":{"start":"2025-09-17","end":"2025-10-10"}}',
  (select convert_to(json_agg(json_build_object('data',to_char(d,'DD/MM/YYYY'),'valor',case when d<'2025-10-08' then '15.00' else '14.50' end) order by d)::text,'UTF8')
   from generate_series('2025-09-17'::date,'2025-10-10'::date,interval '1 day') d));
 perform private.publish_market_odbl_release_v1('${id("a000", 21)}',repeat('e',40),'${founder}');
 perform private.release_market_acquisition_transport_v1('${id("a000", 22)}',false,'${operator}','Synthetic closing after the ODbL proof');
end $seed$;
commit;
select release_number||':'||payload_sha256 from private.market_odbl_releases order by release_number desc limit 1;
`;

test("the ODbL edition appears with its first publication and leaves with its withdrawal, without a deploy", async ({request}) => {
  const published = sql("select count(*) from private.market_odbl_releases;") !== "0";
  if (!published) {
    expect((await request.get("/dados/meta-selic.json")).status()).toBe(404);
    expect((await request.get("/pt-BR/dados/meta-selic")).status()).toBe(404);
    expect(await (await request.get("/sitemap.xml")).text()).not.toContain("/dados/meta-selic");
  }
  const [release, sha256] = sql(seed).split("\n").pop()!.split(":");
  expect(release).toBe("1");
  const withdrawn = sql("select count(*) from private.market_odbl_release_withdrawals;") !== "0";
  if (!withdrawn) {
    const file = await request.get("/dados/meta-selic.json");
    expect(file.status()).toBe(200);
    const bytes = await file.body();
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(sha256);
    expect(file.headers()["x-offroad-sha256"]).toBe(sha256);
    expect(file.headers()["content-type"]).toBe("application/json; charset=utf-8");
    expect(file.headers()["x-content-type-options"]).toBe("nosniff");
    expect(file.headers()["cache-control"]).toBe("no-store");
    expect(file.headers()["set-cookie"]).toBeUndefined();
    const body = JSON.parse(bytes.toString("utf8")) as {license: {uri: string}; observations: unknown[]; changes: {meeting: string}[]};
    expect(body.license.uri).toBe("https://opendatacommons.org/licenses/odbl/1-0/");
    expect(body.observations).toHaveLength(24);
    expect(body.changes.map((c) => c.meeting)).toEqual(["9102"]);
    const page = await request.get("/pt-BR/dados/meta-selic");
    expect(page.status()).toBe(200);
    expect(await page.text()).toContain(sha256);
    expect((await request.get("/en-US/data/selic-target")).status()).toBe(200);
    expect((await request.get("/en-US/dados/meta-selic")).status()).toBe(404);
    expect(await (await request.get("/sitemap.xml")).text()).toContain("/pt-BR/dados/meta-selic");
    // The database answers the anonymous role directly, with the same bytes.
    const api = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (api && key) {
      const rpc = await request.post(`${api}/rest/v1/rpc/market_odbl_release_v1`, {headers: {apikey: key, authorization: `Bearer ${key}`}, data: {p_release: 1}});
      expect(rpc.status()).toBe(200);
      const answer = await rpc.json() as {state: string; sha256: string; payload: string};
      expect(answer.state).toBe("served");
      expect(createHash("sha256").update(answer.payload, "utf8").digest("hex")).toBe(sha256);
    }
    sql(`select private.withdraw_market_odbl_release_v1('${id("a000", 31)}',1,'quality','Retirada sintética da prova ODbL','${founder}');`);
  }
  expect((await request.get("/dados/meta-selic.json")).status()).toBe(410);
  expect((await request.get("/pt-BR/dados/meta-selic")).status()).toBe(404);
  expect(await (await request.get("/sitemap.xml")).text()).not.toContain("/dados/meta-selic");
});

test("the anonymous reader is cancelled by its own two-second limit, below the role's", async ({request}) => {
  const api = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  test.skip(!api || !key, "needs the local Data API");
  sql("select 1;");
  // A session holds the editions table, so the reader waits on its lock until a statement limit cancels it.
  const blocker = spawn("psql", [databaseUrl, "-At", "-v", "ON_ERROR_STOP=1", "-q"], {stdio: ["pipe", "pipe", "pipe"], env: {...process.env, PGAPPNAME: "market_odbl_e2e_blocker"}});
  try {
    blocker.stdin.write("begin;\nlock table private.market_odbl_releases in access exclusive mode;\n\\echo LOCKED\nselect pg_sleep(20);\n");
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("blocker did not take the lock")), 10_000);
      blocker.stdout.on("data", (chunk: Buffer) => { if (chunk.toString().includes("LOCKED")) { clearTimeout(timer); resolve(); } });
    });
    const started = Date.now();
    const rpc = await request.post(`${api}/rest/v1/rpc/market_odbl_release_v1`, {headers: {apikey: key!, authorization: `Bearer ${key}`}, data: {p_release: 1}, timeout: 15_000});
    const elapsed = Date.now() - started;
    expect(rpc.status()).toBeGreaterThanOrEqual(500);
    expect((await rpc.json() as {code?: string}).code).toBe("57014");
    // The function's own limit (2 s) cancels it before the anonymous role's (3 s).
    expect(elapsed).toBeGreaterThanOrEqual(1_800);
    expect(elapsed).toBeLessThan(2_900);
  } finally {
    blocker.kill();
    sql("select pg_terminate_backend(pid) from pg_stat_activity where application_name='market_odbl_e2e_blocker';");
  }
});
