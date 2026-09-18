-- Stage 11: participation is a projection of canonical grants, never a second ACL.
set search_path='';
create table public.work_participants (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 work_id uuid not null, user_id uuid not null references auth.users(id), grant_id uuid not null,
 added_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,work_id,user_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,grant_id) references private.resource_access_grants(organization_id,id)
);
create index work_participants_user_idx on public.work_participants(user_id);
create index work_participants_grant_idx on public.work_participants(organization_id,grant_id);
create index work_participants_actor_idx on public.work_participants(added_by);
create table public.work_channels (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), work_id uuid not null,
 kind text not null check(kind in ('shared','personal','legacy')), owner_user_id uuid references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,work_id,id),
 unique nulls not distinct(organization_id,work_id,kind,owner_user_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 check((kind='personal')=(owner_user_id is not null))
);
create index work_channels_owner_idx on public.work_channels(owner_user_id);
create table public.work_contributions (
 id uuid primary key, organization_id uuid not null references public.organizations(id), work_id uuid not null, channel_id uuid not null,
 author_user_id uuid not null references auth.users(id), head_revision_id uuid,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,work_id,id),
 foreign key(organization_id,work_id,channel_id) references public.work_channels(organization_id,work_id,id)
);
create index work_contributions_channel_idx on public.work_contributions(organization_id,work_id,channel_id);
create index work_contributions_author_idx on public.work_contributions(author_user_id);
create table public.contribution_revisions (
 id uuid primary key, organization_id uuid not null references public.organizations(id), work_id uuid not null, contribution_id uuid not null,
 revision integer not null check(revision>0), previous_revision_id uuid, base_revision_id uuid, promoted_from_revision_id uuid,
 author_user_id uuid not null references auth.users(id), recorded_by uuid not null references auth.users(id),
 content text not null check(length(btrim(content)) between 1 and 16000),
 request_fingerprint text not null check(request_fingerprint ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,work_id,id),unique(organization_id,contribution_id,id),unique(organization_id,contribution_id,revision),
 foreign key(organization_id,work_id,contribution_id) references public.work_contributions(organization_id,work_id,id),
 foreign key(organization_id,contribution_id,previous_revision_id) references public.contribution_revisions(organization_id,contribution_id,id),
 foreign key(organization_id,work_id,base_revision_id) references public.contribution_revisions(organization_id,work_id,id),
 foreign key(organization_id,work_id,promoted_from_revision_id) references public.contribution_revisions(organization_id,work_id,id),
 check((revision=1)=(previous_revision_id is null))
);
alter table public.work_contributions add foreign key(organization_id,id,head_revision_id) references public.contribution_revisions(organization_id,contribution_id,id);
create index contribution_revisions_previous_idx on public.contribution_revisions(organization_id,contribution_id,previous_revision_id);
create index contribution_revisions_base_idx on public.contribution_revisions(organization_id,work_id,base_revision_id);
create index contribution_revisions_promoted_idx on public.contribution_revisions(organization_id,work_id,promoted_from_revision_id);
create index contribution_revisions_author_idx on public.contribution_revisions(author_user_id);
create index contribution_revisions_recorder_idx on public.contribution_revisions(recorded_by);
create index work_contributions_head_idx on public.work_contributions(organization_id,id,head_revision_id);
create table private.contribution_source_dependencies (
 organization_id uuid not null, revision_id uuid not null, source_version_id uuid not null, rights_version_id uuid not null,
 primary key(organization_id,revision_id,source_version_id,rights_version_id),
 foreign key(organization_id,revision_id) references public.contribution_revisions(organization_id,id),
 foreign key(organization_id,source_version_id) references public.source_versions(organization_id,id),
 foreign key(organization_id,rights_version_id) references private.source_rights_versions(organization_id,id)
);
create index contribution_sources_version_idx on private.contribution_source_dependencies(organization_id,source_version_id);
create index contribution_sources_rights_idx on private.contribution_source_dependencies(organization_id,rights_version_id);
alter table private.contribution_source_dependencies enable row level security;
alter table private.contribution_source_dependencies force row level security;
revoke all on private.contribution_source_dependencies from public,anon,authenticated,service_role;
create policy contribution_sources_deny on private.contribution_source_dependencies for all to authenticated using(false) with check(false);

create function private.can_read_work_channel_v1(p_org uuid,p_channel uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.work_channels c where c.organization_id=p_org and c.id=p_channel
 and private.can_access_resource_v1(p_org,c.work_id,'read') and (c.kind<>'personal' or c.owner_user_id=auth.uid()));
$$;
-- A promoted copy preserves the intersection of every pinned and current source right.
-- Readers added later are checked individually, rather than inheriting old disclosure decisions.
create function private.contribution_sources_allowed_v1(p_org uuid,p_revision uuid,p_subject uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select p_subject is not null and not exists(select 1 from private.contribution_source_dependencies d
 left join private.source_rights_versions r on r.organization_id=d.organization_id and r.id=d.rights_version_id and r.source_version_id=d.source_version_id
 where d.organization_id=p_org and d.revision_id=p_revision and (
 r.id is null or not(r.operations @> array['read','derive','store'] and 'analysis'=any(r.purposes)
 and r.valid_from<=clock_timestamp() and (r.expires_at is null or r.expires_at>clock_timestamp()) and (r.store_until is null or r.store_until>clock_timestamp()))
 or not private.source_use_allowed_v1(p_org,d.source_version_id,p_subject,'read','analysis')
 or not private.source_use_allowed_v1(p_org,d.source_version_id,p_subject,'derive','analysis')
 or not private.source_use_allowed_v1(p_org,d.source_version_id,p_subject,'store','analysis')));
$$;
create function private.can_read_contribution_revision_v1(p_org uuid,p_revision uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.contribution_revisions r join public.work_contributions c on c.organization_id=r.organization_id and c.id=r.contribution_id
 where r.organization_id=p_org and r.id=p_revision and private.can_read_work_channel_v1(p_org,c.channel_id)
 and private.contribution_sources_allowed_v1(p_org,r.id,auth.uid()));
$$;
revoke all on function private.can_read_work_channel_v1(uuid,uuid),private.contribution_sources_allowed_v1(uuid,uuid,uuid),private.can_read_contribution_revision_v1(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.can_read_work_channel_v1(uuid,uuid),private.can_read_contribution_revision_v1(uuid,uuid) to authenticated;

do $$ declare t text; predicate text; begin
 foreach t in array array['work_participants','work_channels','work_contributions','contribution_revisions'] loop
 execute format('alter table public.%I enable row level security',t);execute format('alter table public.%I force row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);execute format('grant select on public.%I to authenticated',t);
 predicate:=case t when 'work_participants' then 'private.can_access_resource_v1(organization_id,work_id,''read'') and private.resource_access_as_subject_v1(organization_id,work_id,user_id,''read'')'
 when 'work_channels' then 'private.can_read_work_channel_v1(organization_id,id)'
 when 'work_contributions' then 'private.can_read_work_channel_v1(organization_id,channel_id) and (head_revision_id is null or private.can_read_contribution_revision_v1(organization_id,head_revision_id))'
 else 'private.can_read_contribution_revision_v1(organization_id,id)' end;
 execute format('create policy %I on public.%I for select to authenticated using (%s)',t||'_select',t,predicate);
 execute format('create policy %I on public.%I for insert to authenticated with check(false)',t||'_deny_insert',t);
 execute format('create policy %I on public.%I for update to authenticated using(false) with check(false)',t||'_deny_update',t);
 execute format('create policy %I on public.%I for delete to authenticated using(false)',t||'_deny_delete',t);
 execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()',t||'_updated',t);
 execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.capture_identity_audit_v1()',t||'_audit',t);
 end loop;
end $$;
-- Reuse the append-only guard already used for assumption snapshots.
create function private.guard_contribution_immutable_v1() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'contribution_revision_immutable' using errcode='23514'; end $$;
revoke all on function private.guard_contribution_immutable_v1() from public,anon,authenticated,service_role;
create trigger contribution_revision_immutable before update or delete on public.contribution_revisions for each row execute function private.guard_contribution_immutable_v1();
create trigger contribution_dependency_immutable before update or delete on private.contribution_source_dependencies for each row execute function private.guard_contribution_immutable_v1();

-- Keep the historical audience; do not claim old messages were personal or invent authors.
insert into public.work_channels(organization_id,work_id,kind) select distinct organization_id,work_id,'legacy' from public.agent_conversations where work_id is not null;
alter table public.agent_conversations add column channel_id uuid,
 add foreign key(organization_id,work_id,channel_id) references public.work_channels(organization_id,work_id,id);
alter table public.agent_messages add column channel_id uuid, add column human_author_id uuid references auth.users(id),
 add foreign key(organization_id,work_id,channel_id) references public.work_channels(organization_id,work_id,id);
update public.agent_conversations c set channel_id=h.id from public.work_channels h where h.organization_id=c.organization_id and h.work_id=c.work_id and h.kind='legacy';
update public.agent_messages m set channel_id=c.channel_id,human_author_id=case when m.role='user' then m.created_by else null end
 from public.agent_conversations c where c.organization_id=m.organization_id and c.id=m.conversation_id;
create index agent_conversations_channel_idx on public.agent_conversations(organization_id,work_id,channel_id);
create index agent_messages_channel_idx on public.agent_messages(organization_id,work_id,channel_id);
create index agent_messages_human_author_idx on public.agent_messages(human_author_id);
create function private.bind_work_channel_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare channel uuid; begin
 if tg_table_name='agent_conversations' and new.work_id is not null and new.channel_id is null then
  insert into public.work_channels(organization_id,work_id,kind) values(new.organization_id,new.work_id,'shared')
  on conflict(organization_id,work_id,kind,owner_user_id) do update set work_id=excluded.work_id returning id into channel;
  new.channel_id:=channel;
 elsif tg_table_name='agent_messages' then
  select channel_id into channel from public.agent_conversations where organization_id=new.organization_id and id=new.conversation_id;
  if new.channel_id is not null and new.channel_id is distinct from channel then raise exception 'message_channel_mismatch' using errcode='23514'; end if;
  new.channel_id:=channel;
  if tg_op='INSERT' then
   if new.human_author_id is not null and new.human_author_id is distinct from (case when new.role='user' then new.created_by else null end) then raise exception 'message_author_mismatch' using errcode='23514'; end if;
   new.human_author_id:=case when new.role='user' then new.created_by else null end;
  elsif new.human_author_id is distinct from old.human_author_id then raise exception 'message_author_immutable' using errcode='23514'; end if;
 end if;
 if tg_op='UPDATE' and old.channel_id is not null and new.channel_id is distinct from old.channel_id then raise exception 'message_channel_immutable' using errcode='23514'; end if;
 return new;
end $$;
revoke all on function private.bind_work_channel_v1() from public,anon,authenticated,service_role;
create trigger aab_conversation_channel before insert or update on public.agent_conversations for each row execute function private.bind_work_channel_v1();
create trigger aab_message_channel before insert or update on public.agent_messages for each row execute function private.bind_work_channel_v1();
alter table public.agent_conversations add constraint work_conversation_channel_required check(work_id is null or channel_id is not null);
alter table public.agent_messages add constraint work_message_channel_required check(work_id is null or channel_id is not null);
create policy agent_conversations_channel_boundary on public.agent_conversations as restrictive for select to authenticated
 using(channel_id is null or private.can_read_work_channel_v1(organization_id,channel_id));
create policy agent_messages_channel_boundary on public.agent_messages as restrictive for select to authenticated
 using(channel_id is null or private.can_read_work_channel_v1(organization_id,channel_id));

-- Only actual, direct historical grants are materialized. Group/role access remains in the PDP.
insert into public.work_participants(organization_id,work_id,user_id,grant_id,added_by)
 select distinct on(g.organization_id,g.resource_id,g.subject_user_id) g.organization_id,g.resource_id,g.subject_user_id,g.id,g.granted_by
 from private.resource_access_grants g join public.capital_projects p on p.organization_id=g.organization_id and p.id=g.resource_id
 where g.subject_user_id is not null and g.effect='allow' and g.revoked_at is null
 order by g.organization_id,g.resource_id,g.subject_user_id,case g.action when 'manage' then 0 when 'work' then 1 else 2 end;

create function private.add_work_participant_v1(p_work_id uuid,p_user_id uuid,p_action text default 'work') returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid; grant_id uuid; result uuid; begin
 select organization_id into org from public.capital_projects where id=p_work_id;
 if org is null then raise exception 'work_participant_denied' using errcode='42501'; end if;
 grant_id:=private.grant_resource_access_v1(p_work_id,p_user_id,p_action,null);
 insert into public.work_participants(organization_id,work_id,user_id,grant_id,added_by)
 values(org,p_work_id,p_user_id,grant_id,auth.uid()) on conflict(organization_id,work_id,user_id)
 do update set grant_id=excluded.grant_id,added_by=excluded.added_by returning id into result;
 return result;
end $$;
create function private.ensure_personal_work_channel_v1(p_work_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid; result uuid; begin
 perform private.require_resource_access_v1(p_work_id,'work');
 select organization_id into strict org from public.capital_projects where id=p_work_id and status<>'archived';
 insert into public.work_channels(organization_id,work_id,kind,owner_user_id) values(org,p_work_id,'personal',auth.uid())
 on conflict(organization_id,work_id,kind,owner_user_id) do update set work_id=excluded.work_id returning id into result;
 return result;
end $$;
-- Explicit sources only. A fork inherits every restriction; omission cannot launder lineage.
create function private.pin_contribution_sources_v1(p_org uuid,p_revision uuid,p_sources uuid[],p_parent uuid,p_base uuid) returns void
language plpgsql security definer set search_path='' as $$
declare source_id uuid; right_id uuid; begin
 insert into private.contribution_source_dependencies select p_org,p_revision,source_version_id,rights_version_id from private.contribution_source_dependencies
 where organization_id=p_org and revision_id in (p_parent,p_base) on conflict do nothing;
 foreach source_id in array p_sources loop
  select id into right_id from private.source_rights_versions where organization_id=p_org and source_version_id=source_id order by revision desc limit 1;
  if right_id is null then raise exception 'contribution_source_denied' using errcode='42501'; end if;
  insert into private.contribution_source_dependencies values(p_org,p_revision,source_id,right_id) on conflict do nothing;
 end loop;
 if not private.contribution_sources_allowed_v1(p_org,p_revision,auth.uid()) then raise exception 'contribution_source_denied' using errcode='42501'; end if;
end $$;
revoke all on function private.pin_contribution_sources_v1(uuid,uuid,uuid[],uuid,uuid) from public,anon,authenticated,service_role;

create function private.submit_work_contribution_v1(p_work_id uuid,p_contribution_id uuid,p_revision_id uuid,p_expected_revision_id uuid,p_base_revision_id uuid,p_content text,p_source_version_ids uuid[] default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare org uuid; channel uuid; c public.work_contributions; prior public.contribution_revisions; fingerprint text; sources uuid[]; next_revision integer; begin
 perform private.require_resource_access_v1(p_work_id,'work');
 select organization_id into strict org from public.capital_projects where id=p_work_id and status<>'archived';
 perform pg_advisory_xact_lock(hashtextextended('resource-policy:'||org::text,0));
 perform private.require_resource_access_v1(p_work_id,'work');
 if p_contribution_id is null or p_revision_id is null or p_content is null or length(btrim(p_content)) not between 1 and 16000
 or p_source_version_ids is null or cardinality(p_source_version_ids)>100 or array_position(p_source_version_ids,null) is not null then raise exception 'invalid_contribution' using errcode='22023'; end if;
 select coalesce(array_agg(distinct x order by x),'{}'::uuid[]) into sources from unnest(p_source_version_ids) x;
 fingerprint:=encode(extensions.digest(jsonb_build_array(p_work_id,p_contribution_id,p_expected_revision_id,p_base_revision_id,btrim(p_content),sources)::text,'sha256'),'hex');
 select * into prior from public.contribution_revisions where id=p_revision_id;
 if found then
  if prior.organization_id<>org or prior.author_user_id<>auth.uid() or not private.can_read_contribution_revision_v1(org,prior.id) then raise exception 'contribution_replay_denied' using errcode='42501'; end if;
  if prior.request_fingerprint<>fingerprint then raise exception 'contribution_replay_conflict' using errcode='22023'; end if;
  return jsonb_build_object('contributionId',prior.contribution_id,'revisionId',prior.id,'replayed',true);
 end if;
 if p_base_revision_id is not null and not exists(select 1 from public.contribution_revisions r where r.organization_id=org and r.work_id=p_work_id and r.id=p_base_revision_id and private.can_read_contribution_revision_v1(org,r.id)) then raise exception 'contribution_base_denied' using errcode='42501'; end if;
 channel:=private.ensure_personal_work_channel_v1(p_work_id);
 select * into c from public.work_contributions where id=p_contribution_id for update;
 if found then
  if c.organization_id<>org or c.work_id<>p_work_id or c.channel_id<>channel or c.author_user_id<>auth.uid() then raise exception 'contribution_author_denied' using errcode='42501'; end if;
  if c.head_revision_id is distinct from p_expected_revision_id then raise exception 'contribution_revision_conflict' using errcode='40001'; end if;
  if c.head_revision_id is not null and not private.can_read_contribution_revision_v1(org,c.head_revision_id) then raise exception 'contribution_source_denied' using errcode='42501'; end if;
 else
  if p_expected_revision_id is not null then raise exception 'contribution_revision_conflict' using errcode='40001'; end if;
  insert into public.work_contributions(id,organization_id,work_id,channel_id,author_user_id) values(p_contribution_id,org,p_work_id,channel,auth.uid()) returning * into c;
 end if;
 select coalesce(max(revision),0)+1 into next_revision from public.contribution_revisions where organization_id=org and contribution_id=c.id;
 insert into public.contribution_revisions(id,organization_id,work_id,contribution_id,revision,previous_revision_id,base_revision_id,author_user_id,recorded_by,content,request_fingerprint)
 values(p_revision_id,org,p_work_id,c.id,next_revision,c.head_revision_id,p_base_revision_id,auth.uid(),auth.uid(),btrim(p_content),fingerprint);
 perform private.pin_contribution_sources_v1(org,p_revision_id,sources,c.head_revision_id,p_base_revision_id);
 update public.work_contributions set head_revision_id=p_revision_id where id=c.id;
 return jsonb_build_object('contributionId',c.id,'revisionId',p_revision_id,'replayed',false);
end $$;

create function private.promote_contribution_to_work_v1(p_revision_id uuid,p_promotion_id uuid,p_expected_shared_revision_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.contribution_revisions; c public.work_contributions; shared public.work_contributions; existing public.contribution_revisions; base public.contribution_revisions; channel uuid; next_revision integer; reader uuid; fingerprint text; begin
 select * into r from public.contribution_revisions where id=p_revision_id;
 if not found or r.author_user_id is distinct from auth.uid() then raise exception 'contribution_promotion_denied' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('resource-policy:'||r.organization_id::text,0));
 perform private.require_resource_access_v1(r.work_id,'work');
 if not private.can_read_contribution_revision_v1(r.organization_id,r.id) then raise exception 'contribution_promotion_denied' using errcode='42501'; end if;
 select * into strict c from public.work_contributions where organization_id=r.organization_id and id=r.contribution_id;
 if not exists(select 1 from public.work_channels where id=c.channel_id and kind='personal' and owner_user_id=auth.uid()) then raise exception 'contribution_promotion_denied' using errcode='42501'; end if;
 if p_promotion_id is null then raise exception 'invalid_contribution_promotion' using errcode='22023'; end if;
 fingerprint:=encode(extensions.digest(jsonb_build_array(r.id,p_expected_shared_revision_id)::text,'sha256'),'hex');
 select * into existing from public.contribution_revisions where id=p_promotion_id;
 if found then
  if existing.organization_id<>r.organization_id or existing.promoted_from_revision_id is distinct from r.id or existing.recorded_by<>auth.uid()
  or not private.can_read_contribution_revision_v1(r.organization_id,existing.id) then raise exception 'contribution_promotion_denied' using errcode='42501'; end if;
  if existing.request_fingerprint<>fingerprint then raise exception 'contribution_replay_conflict' using errcode='22023'; end if;
  return jsonb_build_object('contributionId',existing.contribution_id,'revisionId',existing.id,'status','shared','replayed',true);
 end if;
 -- Publication is bounded by the actual current audience, including group grants.
 for reader in select m.user_id from public.organization_memberships m where m.organization_id=r.organization_id and m.status='active'
 and private.resource_access_as_subject_v1(r.organization_id,r.work_id,m.user_id,'read') loop
  if not private.contribution_sources_allowed_v1(r.organization_id,r.id,reader) then raise exception 'contribution_audience_denied' using errcode='42501'; end if;
 end loop;
 if p_expected_shared_revision_id is not null then
  select * into base from public.contribution_revisions where id=p_expected_shared_revision_id and organization_id=r.organization_id and work_id=r.work_id;
  if not found or not private.can_read_contribution_revision_v1(r.organization_id,base.id) then raise exception 'contribution_base_denied' using errcode='42501'; end if;
  select * into shared from public.work_contributions where id=base.contribution_id and organization_id=r.organization_id for update;
  if not exists(select 1 from public.work_channels where id=shared.channel_id and kind='shared') then raise exception 'contribution_base_denied' using errcode='42501'; end if;
  if r.base_revision_id is distinct from base.id then raise exception 'contribution_base_mismatch' using errcode='22023'; end if;
  if shared.head_revision_id<>base.id then
   if not private.can_read_contribution_revision_v1(r.organization_id,shared.head_revision_id) then raise exception 'contribution_base_denied' using errcode='42501'; end if;
   return jsonb_build_object('status','conflict','base',jsonb_build_object('revisionId',base.id,'content',base.content),
    'current',(select jsonb_build_object('revisionId',id,'content',content) from public.contribution_revisions where id=shared.head_revision_id),
    'candidate',jsonb_build_object('revisionId',r.id,'content',r.content));
  end if;
 else
  -- A revision based on a shared contribution must use CAS, not silently create a competing official head.
  if exists(select 1 from public.contribution_revisions b join public.work_contributions bc on bc.organization_id=b.organization_id and bc.id=b.contribution_id
   join public.work_channels ch on ch.id=bc.channel_id where b.id=r.base_revision_id and ch.kind='shared') then raise exception 'contribution_expected_base_required' using errcode='22023'; end if;
  insert into public.work_channels(organization_id,work_id,kind) values(r.organization_id,r.work_id,'shared') on conflict(organization_id,work_id,kind,owner_user_id) do update set work_id=excluded.work_id returning id into channel;
  insert into public.work_contributions(id,organization_id,work_id,channel_id,author_user_id) values(p_promotion_id,r.organization_id,r.work_id,channel,r.author_user_id) returning * into shared;
 end if;
 select coalesce(max(revision),0)+1 into next_revision from public.contribution_revisions where organization_id=r.organization_id and contribution_id=shared.id;
 insert into public.contribution_revisions(id,organization_id,work_id,contribution_id,revision,previous_revision_id,base_revision_id,promoted_from_revision_id,author_user_id,recorded_by,content,request_fingerprint)
 values(p_promotion_id,r.organization_id,r.work_id,shared.id,next_revision,shared.head_revision_id,r.base_revision_id,r.id,r.author_user_id,auth.uid(),r.content,fingerprint);
 perform private.pin_contribution_sources_v1(r.organization_id,p_promotion_id,'{}',r.id,shared.head_revision_id);
 update public.work_contributions set head_revision_id=p_promotion_id where id=shared.id;
 return jsonb_build_object('contributionId',shared.id,'revisionId',p_promotion_id,'status','shared','replayed',false);
end $$;

create function public.add_work_participant_v1(p_work_id uuid,p_user_id uuid,p_action text default 'work') returns uuid language sql security invoker set search_path='' as $$select private.add_work_participant_v1(p_work_id,p_user_id,p_action);$$;
create function public.ensure_personal_work_channel_v1(p_work_id uuid) returns uuid language sql security invoker set search_path='' as $$select private.ensure_personal_work_channel_v1(p_work_id);$$;
create function public.submit_work_contribution_v1(p_work_id uuid,p_contribution_id uuid,p_revision_id uuid,p_expected_revision_id uuid,p_base_revision_id uuid,p_content text,p_source_version_ids uuid[] default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.submit_work_contribution_v1(p_work_id,p_contribution_id,p_revision_id,p_expected_revision_id,p_base_revision_id,p_content,p_source_version_ids);$$;
create function public.promote_contribution_to_work_v1(p_revision_id uuid,p_promotion_id uuid,p_expected_shared_revision_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$select private.promote_contribution_to_work_v1(p_revision_id,p_promotion_id,p_expected_shared_revision_id);$$;
revoke all on function private.add_work_participant_v1(uuid,uuid,text),public.add_work_participant_v1(uuid,uuid,text),private.ensure_personal_work_channel_v1(uuid),public.ensure_personal_work_channel_v1(uuid),private.submit_work_contribution_v1(uuid,uuid,uuid,uuid,uuid,text,uuid[]),public.submit_work_contribution_v1(uuid,uuid,uuid,uuid,uuid,text,uuid[]),private.promote_contribution_to_work_v1(uuid,uuid,uuid),public.promote_contribution_to_work_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.add_work_participant_v1(uuid,uuid,text),public.add_work_participant_v1(uuid,uuid,text),private.ensure_personal_work_channel_v1(uuid),public.ensure_personal_work_channel_v1(uuid),private.submit_work_contribution_v1(uuid,uuid,uuid,uuid,uuid,text,uuid[]),public.submit_work_contribution_v1(uuid,uuid,uuid,uuid,uuid,text,uuid[]),private.promote_contribution_to_work_v1(uuid,uuid,uuid),public.promote_contribution_to_work_v1(uuid,uuid,uuid) to authenticated;

-- Human names are a presentation projection inside the authorized work, never role-based depth.
create function private.list_work_people_v1(p_work_id uuid,p_search text default '',p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare org uuid; manage boolean; result jsonb; begin
 select organization_id into org from public.capital_projects where id=p_work_id;
 if org is null or not private.can_access_resource_v1(org,p_work_id,'read') then raise exception 'work_people_denied' using errcode='42501';end if;
 if p_search is null or length(p_search)>160 or p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'invalid_people_page' using errcode='22023';end if;
 manage:=private.can_access_resource_v1(org,p_work_id,'manage') or private.can_admin_resource_policy_v1(org,p_work_id);
 select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into result from (
 select m.user_id,coalesce(nullif(btrim(p.full_name),''),left(m.user_id::text,8)) as name,
 private.resource_access_as_subject_v1(org,p_work_id,m.user_id,'read') as participates,
 case when private.resource_access_as_subject_v1(org,p_work_id,m.user_id,'manage') then 'manage'
 when private.resource_access_as_subject_v1(org,p_work_id,m.user_id,'work') then 'work' else 'read' end as access
 from public.organization_memberships m left join public.profiles p on p.id=m.user_id
 where m.organization_id=org and m.status='active' and (manage or private.resource_access_as_subject_v1(org,p_work_id,m.user_id,'read'))
 and (p_search='' or position(lower(p_search) in lower(coalesce(p.full_name,'')))>0)
 order by m.user_id limit 51 offset p_offset
 ) q;
 return jsonb_build_object('canManage',manage,'people',result,'offset',p_offset,'viewerId',auth.uid());
end $$;
create function public.list_work_people_v1(p_work_id uuid,p_search text default '',p_offset integer default 0) returns jsonb language sql security invoker set search_path='' as $$select private.list_work_people_v1(p_work_id,p_search,p_offset);$$;
revoke all on function private.list_work_people_v1(uuid,text,integer),public.list_work_people_v1(uuid,text,integer) from public,anon,authenticated,service_role;
grant execute on function private.list_work_people_v1(uuid,text,integer),public.list_work_people_v1(uuid,text,integer) to authenticated;
