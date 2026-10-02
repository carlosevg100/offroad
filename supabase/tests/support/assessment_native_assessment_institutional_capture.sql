-- Loaded from test-assessment-institutional-capture.py after a real case job has
-- been approved and claimed, before any body commit. No job-kind rewriting.
reset role;
do $$declare s private.assessment_input_snapshots;body jsonb;begin
 select value::jsonb into strict body from route_proof where label='assessment_institutional';
 select * into strict s from private.assessment_input_snapshots where id=(body->>'assessmentInputSnapshotId')::uuid;
 if jsonb_array_length(body->'approvedConfigurations')<1 or jsonb_array_length(body->'currentSources')<2 then raise exception 'institutional_nonempty_producer_required';end if;
 if not exists(select 1 from private.assessment_institutional_fixed_rights where snapshot_id=s.id)then raise exception 'institutional_fixed_ancestry_rights_missing';end if;
 if s.origin<>'institutional_context' or s.content_fingerprint<>private.institutional_config_hash(body-'assessmentInputSnapshotId')then raise exception 'institutional_delivered_input_unbound';end if;
 if s.source_count<>(select count(*)from private.assessment_input_source_links where snapshot_id=s.id)
 or exists(select 1 from jsonb_array_elements(body->'currentSources') x where not exists(
   select 1 from private.assessment_input_source_links l where l.snapshot_id=s.id and l.source_version_id=(x->>'sourceDocument')::uuid))then raise exception 'institutional_source_closure_incomplete';end if;
 if private.assessment_input_snapshot_authority_v1(s.organization_id,s.id,s.human_subject_id)<>'allowed'then raise exception 'institutional_input_denied';end if;
 if jsonb_array_length(body->'approvedConfigurations')<>(select count(*)from private.assessment_institutional_configuration_links where snapshot_id=s.id)then raise exception 'institutional_configuration_closure_incomplete';end if;
 raise notice 'PASS assessment_actual_case_input_bytes_sources_configuration_set_closed';
end$$;
set local role authenticated;select pg_temp.as_worker();
do $$declare claim jsonb;body jsonb;replay jsonb;begin
 select value::jsonb into strict claim from route_proof where label='native_claim';
 select value::jsonb into strict body from route_proof where label='assessment_institutional';
 replay:=public.worker_load_assessment_institutional_context_v1((claim->>'job_id')::uuid,claim->>'capability_token');
 if replay<>body then raise exception 'institutional_replay_changed';end if;
 begin perform public.worker_load_assessment_institutional_context_v1((claim->>'job_id')::uuid,repeat('x',64));raise exception 'wrong_capability_accepted';exception when insufficient_privilege then null;end;
 raise notice 'PASS assessment_institutional_exact_replay_wrong_cap_denied';
end$$;
reset role;
-- Source rights revocation reaches the captured approved ancestor, without
-- rewriting configuration, source links or capture. Roll back only this change.
reset role;
do $$declare s private.assessment_input_snapshots;pin private.assessment_institutional_fixed_rights;begin
 select * into strict s from private.assessment_input_snapshots where id=(select(value::jsonb->>'assessmentInputSnapshotId')::uuid from route_proof where label='assessment_institutional');
 select * into strict pin from private.assessment_institutional_fixed_rights where snapshot_id=s.id order by source_version_id limit 1;
 begin
  perform pg_temp.as_owner();
  perform public.set_source_rights_v1(pin.source_version_id,(select max(revision)from private.source_rights_versions where organization_id=s.organization_id and source_version_id=pin.source_version_id),array['store'],array['analysis'],null,null,gen_random_uuid(),repeat('d',64));
  if private.assessment_input_snapshot_authority_v1(s.organization_id,s.id,s.human_subject_id)<>'denied'then raise exception 'institutional_ancestor_revocation_ignored';end if;
  raise exception 'rollback_rights_probe'using errcode='ZX001';
 exception when sqlstate 'ZX001'then null;end;
 if private.assessment_input_snapshot_authority_v1(s.organization_id,s.id,s.human_subject_id)<>'allowed'then raise exception 'institutional_rights_probe_changed_capture';end if;
 raise notice 'PASS assessment_institutional_nonempty_ancestor_rights_revocation';
end$$;
-- Preserve the captured metadata while current human access is revoked.
update public.organization_memberships m set status='revoked' from private.assessment_input_snapshots s
 where s.id=(select(value::jsonb->>'assessmentInputSnapshotId')::uuid from route_proof where label='assessment_institutional')
 and(m.organization_id,m.user_id)=(s.organization_id,s.human_subject_id);
do $$declare s private.assessment_input_snapshots;begin
 select * into strict s from private.assessment_input_snapshots where id=(select(value::jsonb->>'assessmentInputSnapshotId')::uuid from route_proof where label='assessment_institutional');
 if private.assessment_input_snapshot_authority_v1(s.organization_id,s.id,s.human_subject_id)<>'denied'then raise exception 'institutional_membership_revocation_ignored';end if;
 raise notice 'PASS assessment_institutional_human_revocation_denied_capture_preserved';
end$$;
