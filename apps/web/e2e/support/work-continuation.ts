import {execFileSync} from "node:child_process";
import {createHash, randomUUID} from "node:crypto";

/**
 * Local E2E setup of stage 18, increment 4, on the disposable stack only. It records what the
 * product records when a person brings a balancete and adopts one of its values: the document of
 * the work's intake session with its verified bytes (the worker's E0 receipt, as the other journeys
 * record it for synthetic files), the company under analysis, the definitions, the observation read
 * from the document and its adoption in the working basis. Every write goes through the product's
 * own commands under the journey's own account, except the document row and its receipt, which the
 * upload and the worker write in production. Synthetic values; nothing leaves the stack.
 */
export type WorkContinuationSql = (query: string) => string;

export function localSql(databaseUrl: string, baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000"): WorkContinuationSql {
  for (const value of [databaseUrl, baseUrl]) {
    if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(value).hostname)) throw new Error("The continuation journey requires local synthetic services.");
  }
  return (query) => execFileSync("psql", [databaseUrl, "-qAt", "-v", "ON_ERROR_STOP=1"],
    {input: query, encoding: "utf8", env: {...process.env, PGAPPNAME: "offroad e2e continuation journey"}}).trim();
}

/** Exact text as a SQL value: no quoting can change it on the way. */
const literal = (value: string) => `convert_from(decode('${Buffer.from(value, "utf8").toString("hex")}','hex'),'UTF8')`;

/** Acts as the journey's account inside one transaction, as a signed-in request would. */
function asOwner(email: string, projectId: string, body: string): string {
  return `begin;
do $$
declare actor uuid; s public.document_intake_sessions; result jsonb;
begin
 select id into strict actor from auth.users where email=${literal(email)} and email like 'e2e-continuation-%@example.com';
 select * into strict s from public.document_intake_sessions where capital_project_id='${projectId}' and started_by=actor order by created_at limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 perform set_config('request.headers',jsonb_build_object('x-offroad-workspace',s.organization_id)::text,true);
 ${body}
 perform set_config('e2e.result',result::text,true);
end $$;
select current_setting('e2e.result');
commit;`;
}

/** The row the upload writes and the E0 receipt the worker records for verified bytes. */
function documentVersion(version: {documentId: string; logical: string | null; path: string; sha256: string; number: number}): string {
  return `
 insert into public.source_documents(id,organization_id,intake_session_id,logical_source_id,object_path,original_name,mime_type,byte_size,sha256,created_by,processing_status,document_version)
 values('${version.documentId}',s.organization_id,s.id,${version.logical ? `'${version.logical}'` : "default"},s.organization_id::text||'/'||s.id::text||'/${version.path}',
  'balancete-sintetico.csv','text/csv',96,'${version.sha256}',actor,'ready',${version.number});
 insert into private.source_version_verifications(organization_id,source_version_id,job_id,observed_sha256,observed_byte_size,receipt_id)
 values(s.organization_id,'${version.documentId}',gen_random_uuid(),'${version.sha256}',96,'synthetic-e2e-balancete-'||'${version.documentId}');`;
}

export type SeededBasis = {
  documentId: string; sourceId: string; observationId: string; basisVersionId: string; revision: number;
  dossierId: string; entityId: string; cashDefinitionId: string; setId: string;
};

const cashDimensions = (entity: string, definition: string) =>
  `jsonb_build_object('entityId',${entity},'perimeter','consolidated','periodStart',null,'periodEnd','2025-12-31','currency','BRL','unit','currency','scale','1','scenario','actual','definitionVersionId',${definition})`;

/**
 * Version 1 of the balancete and the working basis over it: the company under analysis, the
 * definitions of available cash and EBITDA, the observation of available cash read from version 1
 * and adopted, and an EBITDA working assumption. The basis is the one the root execution pins.
 */
export function seedSourceBasis(sql: WorkContinuationSql, input: {email: string; projectId: string}): SeededBasis {
  const documentId = randomUUID();
  const sha256 = createHash("sha256").update(`synthetic balancete version 1 ${documentId}`).digest("hex");
  const raw = sql(asOwner(input.email, input.projectId, `
 declare dossier uuid; entity uuid; cash uuid; ebitda uuid; observation uuid; basis uuid;
 begin
 ${documentVersion({documentId, logical: null, path: "balancete-sintetico-v1.csv", sha256, number: 1})}
 select id into strict dossier from public.dossiers where organization_id=s.organization_id and resource_id=s.id;
 entity:=public.review_dossier_identity_v1(dossier,null,'Synthetic Continuation Company','BR:CNPJ','11444777000161','Synthetic explicit identity review');
 perform public.link_dossier_entity_v1(dossier,entity,'subject','{"basis":"consolidated"}','2020-01-01',null,'Synthetic explicit perimeter',gen_random_uuid());
 cash:=public.record_definition_version_v1(dossier,'liquidity.available_cash','reported','Synthetic explicit liquidity.available_cash definition',null,null,null,0,gen_random_uuid());
 ebitda:=public.record_definition_version_v1(dossier,'financials.ebitda','reported','Synthetic explicit financials.ebitda definition',null,null,null,0,gen_random_uuid());
 observation:=public.record_observation_v1(jsonb_build_object('requestId',gen_random_uuid(),'dossierId',dossier,'fieldPath','liquidity.available_cash',
  'dimensions',${cashDimensions("entity", "cash")},'value',jsonb_build_object('type','number','value','1250.5'),'sourceVersionId','${documentId}'::uuid,
  'anchor',jsonb_build_object('page',1,'row','caixa disponivel'),'supersedesId',null));
 basis:=public.adopt_observation_for_work_v1(jsonb_build_object('requestId',gen_random_uuid(),'workId','${input.projectId}','purpose','prepare-capital-structure-decision',
  'contextKey','base','expectedVersionId',null,'reason','Synthetic explicit selection of the balancete value','observationId',observation));
 basis:=public.propose_assumption_revision_v1(jsonb_build_object('requestId',gen_random_uuid(),'workId','${input.projectId}','purpose','prepare-capital-structure-decision',
  'contextKey','base','expectedVersionId',basis,'reason','Synthetic explicit working assumption','fieldPath','financials.ebitda',
  'dimensions',jsonb_build_object('entityId',entity,'perimeter','consolidated','periodStart','2025-01-01','periodEnd','2025-12-31','currency','BRL','unit','currency','scale','1','scenario','actual','definitionVersionId',ebitda),
  'value',jsonb_build_object('type','number','value','400'),'referenceObservationId',null));
 result:=jsonb_build_object('documentId','${documentId}','sourceId',(select source_id from public.source_versions where id='${documentId}'),'observationId',observation,
  'basisVersionId',basis,'revision',(select revision from public.assumption_versions where id=basis),'setId',(select set_id from public.assumption_versions where id=basis),
  'dossierId',dossier,'entityId',entity,'cashDefinitionId',cash);
 end;`));
  return JSON.parse(raw.split("\n").at(-1)!) as SeededBasis;
}

/** Version 2 of the same balancete, with its verified bytes: a new version of the logical source. */
export function addSourceVersion(sql: WorkContinuationSql, input: {email: string; projectId: string; seeded: SeededBasis}): string {
  const documentId = randomUUID();
  const sha256 = createHash("sha256").update(`synthetic balancete version 2 ${documentId}`).digest("hex");
  sql(asOwner(input.email, input.projectId, `
 ${documentVersion({documentId, logical: input.seeded.sourceId, path: "balancete-sintetico-v2.csv", sha256, number: 2})}
 result:=jsonb_build_object('documentId','${documentId}');`));
  return documentId;
}

/** The person reads available cash from version 2 and adopts it: a new revision of the working basis. */
export function readoptFromVersion(sql: WorkContinuationSql, input: {email: string; projectId: string; seeded: SeededBasis; documentId: string}): string {
  const raw = sql(asOwner(input.email, input.projectId, `
 declare observation uuid; head uuid; basis uuid;
 begin
 observation:=public.record_observation_v1(jsonb_build_object('requestId',gen_random_uuid(),'dossierId','${input.seeded.dossierId}'::uuid,'fieldPath','liquidity.available_cash',
  'dimensions',${cashDimensions(`'${input.seeded.entityId}'::uuid`, `'${input.seeded.cashDefinitionId}'::uuid`)},'value',jsonb_build_object('type','number','value','1300'),
  'sourceVersionId','${input.documentId}'::uuid,'anchor',jsonb_build_object('page',1,'row','caixa disponivel'),'supersedesId','${input.seeded.observationId}'::uuid));
 select v.id into strict head from public.assumption_versions v where v.set_id='${input.seeded.setId}' order by v.revision desc limit 1;
 basis:=public.adopt_observation_for_work_v1(jsonb_build_object('requestId',gen_random_uuid(),'workId','${input.projectId}','purpose','prepare-capital-structure-decision',
  'contextKey','base','expectedVersionId',head,'reason','Synthetic explicit selection of the new balancete value','observationId',observation));
 result:=jsonb_build_object('basisVersionId',basis);
 end;`));
  return (JSON.parse(raw.split("\n").at(-1)!) as {basisVersionId: string}).basisVersionId;
}
