-- Stage 20 / 3F: historical integrity only. No access, approval or release decision.
set search_path='';
create function private.institutional_configuration_ancestry_v1(p_org uuid,p_work uuid,p_configuration uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 c private.institutional_model_configurations; parent private.institutional_model_configurations;
 r private.institutional_contribution_receipts; m public.agent_messages;
 x private.institutional_setup_input_snapshots; root jsonb; binding jsonb;
 visited uuid[]:='{}'; nodes jsonb:='[]'; sources jsonb; application jsonb;
 current_id uuid:=p_configuration; reason text; depth integer;
begin
 for depth in 1..128 loop
  if current_id=any(visited) then reason:='cycle';exit;end if;
  visited:=array_append(visited,current_id);
  select * into c from private.institutional_model_configurations where organization_id=p_org and id=current_id;
  if c.id is null then reason:='configuration_missing';exit;end if;
  if c.capital_project_id is distinct from p_work then reason:='work_mismatch';exit;end if;
  if c.configuration_fingerprint is distinct from private.institutional_config_hash(c.configuration) then reason:='configuration_hash_mismatch';exit;end if;
  if c.answer_evidence->>'kind'='initial_configuration' then
   root:=private.institutional_configuration_capture_state_v1(p_org,c.id);
   if root->>'state' is distinct from 'captured_root' then reason:='root_unproven';exit;end if;
   select * into x from private.institutional_setup_input_snapshots where organization_id=p_org and id=(root->>'snapshotId')::uuid;
   if x.work_id is distinct from p_work or x.context_fingerprint is distinct from private.institutional_config_hash(x.context)
    then reason:='root_snapshot_mismatch';exit;end if;
   select coalesce(jsonb_agg(jsonb_build_object('sourceVersionId',l.source_version_id,'rightsVersionId',l.rights_version_id,
     'declaredSha256',v.declared_sha256) order by l.source_version_id,l.rights_version_id),'[]'::jsonb)
    into sources from private.institutional_setup_source_links l
    join public.source_versions v on (v.organization_id,v.id)=(l.organization_id,l.source_version_id)
    where l.organization_id=p_org and l.snapshot_id=x.id;
   nodes:=nodes||jsonb_build_array(jsonb_build_object('kind','setup','configurationId',c.id,'configurationFingerprint',c.configuration_fingerprint,'snapshotId',x.id,'contextFingerprint',x.context_fingerprint));
   return jsonb_build_object('state','captured_lineage','authorization','not_evaluated','organizationId',p_org,'workId',p_work,
    'configurationId',p_configuration,'nodes',nodes,'sources',sources);
  end if;
  if c.answer_evidence->>'kind' is not null then reason:='unsupported_origin';exit;end if;
  select * into r from private.institutional_contribution_receipts where organization_id=p_org and candidate_id=c.id;
  if r.id is null then reason:='contribution_receipt_missing';exit;end if;
  select * into parent from private.institutional_model_configurations where organization_id=p_org and id=r.parent_configuration_id;
  if parent.id is null then reason:='parent_missing';exit;end if;
  if (r.work_id,parent.capital_project_id,r.candidate_fingerprint,r.parent_fingerprint)
   is distinct from (p_work,p_work,c.configuration_fingerprint,c.parent_fingerprint)
   or parent.configuration_fingerprint is distinct from r.parent_fingerprint
   or parent.configuration_fingerprint is distinct from private.institutional_config_hash(parent.configuration)
   then reason:='contribution_parent_mismatch';exit;end if;
  select * into m from public.agent_messages where organization_id=p_org and id=r.message_id;
  select b.binding into binding from private.institutional_information_request_bindings b where b.organization_id=p_org and b.information_request_id=r.request_id;
  if m.id is null or (m.intake_session_id,m.created_by,m.role::text) is distinct from (r.intake_session_id,r.author_id,'user')
   or c.answer_message_id is distinct from r.message_id or binding is distinct from r.binding
   or encode(extensions.digest(convert_to(trim(m.content),'utf8'),'sha256'),'hex') is distinct from r.response_fingerprint
   or r.binding->>'expectedConfigurationFingerprint' is distinct from r.parent_fingerprint
   or (r.binding->>'assumptionId',r.binding->>'period',r.binding->>'unit') is distinct from (r.assumption_id,r.period,r.unit)
   or (c.answer_evidence->>'requestId',c.answer_evidence->>'messageId',c.answer_evidence->>'answeredBy',c.answer_evidence->>'responseFingerprint',c.answer_evidence->>'canonicalValue',c.answer_evidence->>'priorValue',c.answer_evidence->>'assumptionId',c.answer_evidence->>'period',c.answer_evidence->>'unit')
    is distinct from (r.request_id::text,r.message_id::text,r.author_id::text,r.response_fingerprint,r.canonical_value,r.prior_value,r.assumption_id,r.period,r.unit)
   or (r.answer_ref->>'messageId',r.answer_ref->>'answeredBy',r.answer_ref->>'responseFingerprint',r.answer_ref->>'answeredAt')
    is distinct from (r.message_id::text,r.author_id::text,r.response_fingerprint,c.answer_evidence->>'answeredAt')
   or not exists(select 1 from public.document_intake_sessions s where (s.organization_id,s.id,s.capital_project_id)=(p_org,r.intake_session_id,p_work))
   or not exists(select 1 from public.capital_project_information_requests q where (q.organization_id,q.id,q.capital_project_id)=(p_org,r.request_id,p_work))
   then reason:='contribution_evidence_mismatch';exit;end if;
  application:=jsonb_build_object('status','review_required','willExecute',false,'patchId','information-response:'||r.message_id::text,
   'expectedConfigurationFingerprint',r.parent_fingerprint,'nextConfigurationFingerprint',r.candidate_fingerprint,
   'nextConfiguration',c.configuration,'answerEvidence',c.answer_evidence);
  if private.institutional_config_hash(application) is distinct from r.application_fingerprint then reason:='contribution_application_mismatch';exit;end if;
  nodes:=nodes||jsonb_build_array(jsonb_build_object('kind','contribution','configurationId',c.id,'configurationFingerprint',c.configuration_fingerprint,
   'receiptId',r.id,'applicationFingerprint',r.application_fingerprint,'parentConfigurationId',parent.id,'parentFingerprint',r.parent_fingerprint));
  current_id:=parent.id;
 end loop;
 -- Never expose a partial chain as proof, including when the fixed traversal limit is reached.
 return jsonb_build_object('state','unresolved','reason',coalesce(reason,'depth_limit'),'authorization','not_evaluated');
end $$;
revoke all on function private.institutional_configuration_ancestry_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;
comment on function private.institutional_configuration_ancestry_v1(uuid,uuid,uuid) is 'Private bounded historical integrity resolver. Pins are not current source-use authority. No release, approval, import attestation, legacy repair or client grants. Consumers must independently revalidate all pinned source rights and authority.';
