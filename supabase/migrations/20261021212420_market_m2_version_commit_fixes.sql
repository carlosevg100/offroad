-- M2 part 1, fixes found by the SQL tests: the replay of a version confirmation answers only while the
-- worker token that held the lease is still active, as the replay of the old confirmation did.
create or replace function private.worker_commit_market_version_v1(p_job_id uuid,p_capability_token text,p_lease_id uuid,p_content bytea,p_content_type text,p_acquired_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.market_acquisition_jobs;a private.market_acquisition_allocations;s private.market_source_revisions;c private.market_endpoint_contracts;
 n private.market_normalizations;o storage.objects;r private.market_version_commits;sha text;md5hex text;parser text;policy text;fp text;today date;
 obs jsonb;created jsonb;result jsonb;d record;m private.market_copom_meetings;is_reference boolean:=false;version_id uuid;begin
 perform 1 from auth.users where id=auth.uid() and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found then raise exception 'market_acquisition_lease_denied' using errcode='42501';end if;
 select * into j from private.market_acquisition_jobs where id=p_job_id for update;
 if not found or j.contract_id is null then raise exception 'market_acquisition_lease_denied' using errcode='42501';end if;
 if p_content is null or p_content_type is null or p_acquired_at is null then raise exception 'market_acquisition_invalid' using errcode='22023';end if;
 sha:=encode(extensions.digest(p_content,'sha256'),'hex');
 -- Replay: the original answer, to the account and capability of the attempt that confirmed it.
 select * into r from private.market_version_commits where job_id=j.id;
 if found then
  if r.lease_id is distinct from p_lease_id or r.account_user_id is distinct from auth.uid() or p_capability_token is null
  or r.capability_sha256 is distinct from extensions.digest(p_capability_token,'sha256')
  or r.fingerprint is distinct from private.market_commit_fingerprint_v1(j.id,p_lease_id,sha,p_content_type,p_acquired_at,r.contract_id,r.parser,r.quality_policy)
  or not exists(select 1 from private.market_acquisition_allocations x join private.worker_tokens w on w.id=x.worker_token_id
   where x.id=r.acquisition_id and w.execution_account_user_id=auth.uid() and w.status='active' and w.revoked_at is null)
  then raise exception 'market_acquisition_lease_denied' using errcode='42501';end if;
  return r.result||jsonb_build_object('replayed',true);
 end if;
 j:=private.market_acquisition_for_lease_v1(p_job_id,p_capability_token,p_lease_id);
 perform private.market_attempt_current_v1(j);
 select * into strict a from private.market_acquisition_allocations where id=j.allocation_id and lease_id=j.lease_id;
 select * into c from private.market_endpoint_contracts where id=j.contract_id;
 s:=private.market_source_in_force_v1(j.source_id);
 if octet_length(p_content)>c.max_bytes or octet_length(p_content)=0 or p_acquired_at<j.leased_at or p_acquired_at>clock_timestamp()
 or not private.market_extension_content_type_v1(c.extension,p_content_type) then raise exception 'market_acquisition_invalid' using errcode='22023';end if;
 if private.market_contract_url_v1(c.id,j.request,null)<>j.url or not private.market_url_allowed_v1(j.url,s.allowed_hosts)
 or not private.market_source_cites_contract_v1(s.license,c) then raise exception 'market_contract_mismatch' using errcode='42501';end if;
 md5hex:=md5(p_content);
 select * into o from storage.objects where bucket_id=a.bucket_id and name=a.object_path for share;
 if not found or (o.metadata->>'size')::bigint is distinct from octet_length(p_content)::bigint or o.metadata->>'mimetype' is distinct from p_content_type
 or o.metadata->>'eTag' is distinct from '"'||md5hex||'"'
 or (to_jsonb(o)->>'is_versioned')::boolean is true or (to_jsonb(o)->>'is_delete_marker')::boolean is true or to_jsonb(o)->>'archived_at' is not null
 then raise exception 'market_acquisition_object_mismatch' using errcode='55000';end if;
 insert into private.market_acquisitions(id,publisher_organization_id,source_id,source_revision,url,final_url,acquired_at,sha256,byte_size,content_type,object_path,processing_job_id)
 values(a.id,private.market_publisher_organization_v1(),j.source_id,j.source_revision,j.url,j.url,p_acquired_at,sha,octet_length(p_content),p_content_type,a.object_path,j.id);
 today:=private.market_sao_paulo_date_v1(clock_timestamp());
 if c.kind='sgs_daily_json' then
  select * into n from private.market_normalizations where endpoint_contract_id=c.id order by ordinal desc limit 1;
  parser:=n.parser;policy:=n.quality_policy_id||'@'||n.quality_policy_version;
  select coalesce(jsonb_agg(jsonb_build_object('period',to_char(x.period,'YYYY-MM-DD'),'value',x.value) order by x.period),'[]') into obs
  from private.market_parse_sgs_daily_v1(p_content,(j.request#>>'{window,start}')::date,(j.request#>>'{window,end}')::date,today) x;
  created:=private.create_market_selic_version_v1(a.id,n.id,null,obs,today,(j.request#>>'{window,start}')::date,
   least((j.request#>>'{window,end}')::date,today),j.id,null);
  version_id:=(created->>'versionId')::uuid;
  result:=jsonb_build_object('committed',true,'replayed',false,'acquisitionId',a.id,'versionId',version_id,'quality',created->'quality');
 elsif c.kind='copom_communique_detail' then
  parser:=c.parser;
  select * into d from private.market_parse_copom_detail_v1(p_content,(j.request->>'meeting')::int);
  insert into private.market_copom_communique_acquisitions(acquisition_id,meeting,reference_date,decision,target_pct,record_sha256,title,body,parser,series_change_date,regulatory_effective_from)
  values(a.id,(j.request->>'meeting')::int,d.reference_date,d.decision,d.target_pct,d.record_sha256,d.title,d.body,parser,d.series_change_date,d.regulatory_effective_from);
  begin
   insert into private.market_copom_meetings(meeting,reference_date,decision,target_pct,reference_acquisition_id,reference_acquired_at,record_sha256,series_change_date)
   values((j.request->>'meeting')::int,d.reference_date,d.decision,d.target_pct,a.id,p_acquired_at,d.record_sha256,d.series_change_date)
   on conflict (meeting) do nothing;
  exception when unique_violation then raise exception 'market_copom_meeting_day_collision' using errcode='23505';
  end;
  select * into m from private.market_copom_meetings where meeting=(j.request->>'meeting')::int for update;
  if m.reference_date<>d.reference_date or m.decision<>d.decision or m.target_pct<>d.target_pct then raise exception 'market_copom_meeting_disagreement' using errcode='23514';end if;
  is_reference:=m.reference_acquisition_id=a.id;
  result:=jsonb_build_object('committed',true,'replayed',false,'acquisitionId',a.id,'meeting',m.meeting,'reference',is_reference);
 else
  parser:=c.parser;
  perform private.market_parse_copom_list_v1(p_content,(j.request->>'size')::int);
  result:=jsonb_build_object('committed',true,'replayed',false,'acquisitionId',a.id);
 end if;
 -- The waits above (meeting row, unique keys, locks) do not extend the lease.
 if j.lease_expires_at<=clock_timestamp() then raise exception 'market_acquisition_lease_denied' using errcode='42501';end if;
 fp:=private.market_commit_fingerprint_v1(j.id,p_lease_id,sha,p_content_type,p_acquired_at,c.id,parser,policy);
 update private.market_acquisition_jobs set status='succeeded',acquisition_id=a.id,lease_id=null,leased_by=null,leased_account_user_id=null,leased_at=null,
  lease_expires_at=null,capability_sha256=null where id=j.id;
 insert into private.market_acquisition_job_events(job_id,event,worker_token_id,lease_id,detail)
 values(j.id,'committed',j.leased_by,p_lease_id,jsonb_build_object('acquisitionId',a.id,'fingerprint',fp));
 insert into private.market_version_commits(job_id,lease_id,account_user_id,capability_sha256,contract_id,parser,quality_policy,fingerprint,acquisition_id,version_id,result)
 values(j.id,p_lease_id,auth.uid(),j.capability_sha256,c.id,parser,policy,fp,a.id,version_id,result);
 return result;
end $$;
