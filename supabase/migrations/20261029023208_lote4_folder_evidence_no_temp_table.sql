-- The folder evidence (ficha C09) read the registry of the work's dossiers through a temporary table created inside the
-- function, which the database lint (plpgsql_check) cannot resolve. The same body reads the active links once into a
-- local value and selects from it: the subject, parent and group selection, the label truncation, the ordering and the
-- null handling are unchanged. Same signature, grants, security definer and search_path.
set local lock_timeout='5s';

create or replace function private.worker_document_folder_evidence_v1(p_job_id uuid,p_capability_token text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare job_row public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);org uuid;work uuid;subject uuid;company uuid;
 dossier_ids uuid[];subject_entity uuid;parent_entity uuid;group_id uuid;group_label text;entities jsonb;decisions jsonb;vault jsonb;files jsonb;others uuid[];
 author text;message_date timestamptz;links jsonb;
begin
 if job_row.kind<>'agent_operation_brief' then raise exception 'agent_operation_brief_capability_required' using errcode='42501';end if;
 org:=job_row.organization_id;subject:=job_row.authorization_subject_id;
 -- The person who wrote the turn's message and when: the author and date of any answer to an open question.
 -- The name and the job title come from the profile, the role in the organization when there is no title.
 select left(nullif(btrim(concat_ws(', ',nullif(btrim(pr.full_name),''),coalesce(nullif(btrim(pr.job_title),''),om.role))),''),200),m.created_at
  into author,message_date
 from public.agent_messages m
 left join public.profiles pr on pr.id=coalesce(m.human_author_id,m.created_by)
 left join public.organization_memberships om on om.organization_id=m.organization_id and om.user_id=coalesce(m.human_author_id,m.created_by) and om.status='active'
 -- A turn the folder readings resumed answers with the person's original message, never the system's continuation.
 where m.organization_id=org and m.id=coalesce(nullif(job_row.payload#>>'{document_folder_resume,source_message_id}','')::uuid,nullif(job_row.payload->>'message_id','')::uuid)
  and m.role='user' and coalesce(m.metadata->>'origin','person')<>'system' and nullif(btrim(pr.full_name),'') is not null;
 select capital_project_id into work from public.document_intake_sessions where organization_id=org and id=job_row.intake_session_id;
 if work is null or subject is null then
  return jsonb_build_object('subjectEntityId',null,'entities','[]'::jsonb,'decisions','[]'::jsonb,'vault','[]'::jsonb,'files','[]'::jsonb,'author',author,'messageDate',message_date);
 end if;
 select company_id into company from public.capital_projects where organization_id=org and id=work;
 dossier_ids:=private.document_folder_work_dossiers_v1(org,work,subject);
 -- The registry: the active links of those dossiers, read once into a local value. The subject and the parent count only when unique.
 select coalesce(jsonb_agg(jsonb_build_object('entity_id',l.entity_id,'relationship',l.relationship,'perimeter',l.perimeter,'legal_name',en.legal_name,'kind',en.kind,
   'valid_from',l.valid_from,'id',l.id)),'[]'::jsonb) into links
 from public.dossier_entity_links l join public.entities en on en.id=l.entity_id
 where l.organization_id=org and l.dossier_id=any(dossier_ids) and l.withdrawn_at is null and l.valid_from<=now() and (l.valid_until is null or l.valid_until>now());
 select case when count(distinct entity_id)=1 then min(entity_id::text)::uuid end into subject_entity from jsonb_to_recordset(links) as fl(entity_id uuid,relationship text,perimeter jsonb,legal_name text,kind text,valid_from timestamptz,id uuid) where relationship='subject' and kind<>'economic_group';
 select case when count(distinct entity_id)=1 then min(entity_id::text)::uuid end into parent_entity from jsonb_to_recordset(links) as fl(entity_id uuid,relationship text,perimeter jsonb,legal_name text,kind text,valid_from timestamptz,id uuid) where relationship='parent' and kind<>'economic_group';
 select case when count(distinct entity_id)=1 then min(entity_id::text)::uuid end,min(left(legal_name,300)) into group_id,group_label from jsonb_to_recordset(links) as fl(entity_id uuid,relationship text,perimeter jsonb,legal_name text,kind text,valid_from timestamptz,id uuid) where kind='economic_group';
 if group_id is null then group_id:=subject_entity;select left(legal_name,300) into group_label from jsonb_to_recordset(links) as fl(entity_id uuid,relationship text,perimeter jsonb,legal_name text,kind text,valid_from timestamptz,id uuid) where entity_id=subject_entity limit 1;end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',x.entity_id,'label',left(x.legal_name,300),'groupId',group_id,'groupLabel',group_label,
   'parentId',case x.relationship when 'subject' then parent_entity when 'subsidiary' then subject_entity end,
   'ownership',case when x.perimeter->>'ownership' ~ '^[0-9]{1,4}(\.[0-9]{1,8})?$' then x.perimeter->'ownership' end) order by x.rank,x.valid_from,x.entity_id),'[]'::jsonb) into entities
 from (select distinct on (f.entity_id) f.entity_id,f.relationship,f.perimeter,f.legal_name,f.valid_from,
   case f.relationship when 'subject' then 1 when 'parent' then 2 else 3 end rank
  from jsonb_to_recordset(links) as f(entity_id uuid,relationship text,perimeter jsonb,legal_name text,kind text,valid_from timestamptz,id uuid) where f.relationship in ('subject','parent','subsidiary') and f.kind<>'economic_group' and group_id is not null
  order by f.entity_id,case f.relationship when 'subject' then 1 when 'parent' then 2 else 3 end,f.valid_from,f.id) x;
 if jsonb_array_length(entities)>200 then entities:=(select jsonb_agg(e.v order by e.n) from jsonb_array_elements(entities) with ordinality e(v,n) where e.n<=200);end if;
 -- The company's other works the subject may read: by a shared dossier or the same company.
 select coalesce(array_agg(p.id order by p.created_at,p.id),'{}'::uuid[]) into others from public.capital_projects p
 where p.organization_id=org and p.id<>work
  and ((company is not null and p.company_id=company) or private.document_folder_work_dossiers_v1(org,p.id,subject)&&dossier_ids)
  and private.evaluate_resource_policy_v1(org,p.id,subject,'read','analysis');
 -- Decisions in course: the open ones, by the kind their latest objective names; a work without one is left out.
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'label',left(d.project_name,300),'kind',d.kind) order by d.created_at,d.id),'[]'::jsonb) into decisions
 from (select p.id,p.project_name,p.created_at,private.document_folder_decision_kind_v1((select o.objective_kind from public.capital_project_objective_preflights o
   where o.organization_id=org and o.capital_project_id=p.id order by o.created_at desc,o.id desc limit 1)) kind
  from public.capital_projects p where p.organization_id=org and p.id=any(others) and p.status in ('active','paused')
  order by p.created_at desc,p.id desc limit 50) d where d.kind is not null;
 -- The vault: documents of those works, one per hash (the earliest).
 select coalesce(jsonb_agg(jsonb_build_object('documentId',v.id,'sha256',v.sha256,'label',left(v.original_name,300),'instrumentRef',null) order by v.created_at,v.id),'[]'::jsonb) into vault
 from (select distinct on (sd.sha256) sd.id,sd.sha256,sd.original_name,sd.created_at from public.source_documents sd
  join public.document_intake_sessions ss on ss.organization_id=sd.organization_id and ss.id=sd.intake_session_id
  where sd.organization_id=org and ss.capital_project_id=any(others) and sd.sha256 ~ '^[a-f0-9]{64}$' and sd.processing_status='ready'
  order by sd.sha256,sd.created_at,sd.id limit 2000) v;
 -- The work's files in arrival order, each with its latest ready layer and why it could not be opened, when it could not.
 select coalesce(jsonb_agg(jsonb_build_object('documentId',f.id,'fileName',left(f.original_name,260),'sha256',f.sha256,'mimeType',left(f.mime_type,200),
   'status',case f.processing_status when 'ready' then 'ready' when 'failed' then 'failed' when 'rejected' then 'rejected' else 'processing' end,
   'locked',case when f.failure_code='encrypted' then 'password_protected' when f.failure_code in ('unsupported_format','unsupported_legacy_format') then 'unsupported_format' end,
   'layer',null,'layerObjectPath',f.layer_path,'layerKind',f.layer_kind,'layerSha256',f.layer_sha256) order by f.created_at,f.id),'[]'::jsonb) into files
 from (select sd.id,sd.original_name,sd.sha256,sd.mime_type,sd.processing_status,sd.created_at,
   (select j.last_error->>'code' from public.processing_jobs j where j.organization_id=sd.organization_id and j.source_document_id=sd.id and j.kind='document_pipeline'
     order by j.created_at desc,j.id desc limit 1) failure_code,
   l.object_path layer_path,l.layer_kind,l.sha256 layer_sha256
  from public.source_documents sd
  join public.document_intake_sessions ss on ss.organization_id=sd.organization_id and ss.id=sd.intake_session_id
  left join lateral (select x.object_path,x.layer_kind,x.sha256 from public.document_layers x where x.organization_id=sd.organization_id and x.source_document_id=sd.id and x.status='ready'
   order by x.document_version desc,x.created_at desc limit 1) l on true
  where sd.organization_id=org and ss.capital_project_id=work and sd.sha256 ~ '^[a-f0-9]{64}$'
  order by sd.created_at,sd.id limit 1000) f;
 return jsonb_build_object('subjectEntityId',subject_entity,'entities',entities,'decisions',decisions,'vault',vault,'files',files,'author',author,'messageDate',message_date);
end $$;
revoke all on function private.worker_document_folder_evidence_v1(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.worker_document_folder_evidence_v1(uuid,text) to authenticated;