-- Stage 23: frozen distribution is a quarantined staging archive, never a released exchange.
-- Conditional DDL is deliberately a no-op in production/replay when these objects are absent.
-- No table, business row, historical migration or structural trigger is deleted.
set search_path='';
do $$ declare signature text;target regprocedure;name text;relation regclass;begin
 foreach signature in array array['private.authorize_pack_distribution(uuid,uuid,uuid,text,text,jsonb)','private.open_shared_information_pack_item(uuid,uuid)','private.pack_response_codes_valid(jsonb)','private.pack_share_live_for_recipient(uuid,uuid)','private.prepare_qualified_contact(uuid,uuid,text,text)','private.read_shared_information_pack(uuid)','private.read_shared_pack_item_material(uuid,uuid)','private.record_information_pack_revision(uuid,uuid,jsonb)','private.record_pack_distribution_next_step(uuid,text,text)','private.record_pack_recipient_response(uuid,text,text,numeric,text,integer,text,numeric,numeric,jsonb,jsonb,uuid)','private.release_qualified_contact(uuid,text)','private.resolve_pack_distribution_candidates(uuid,uuid)','private.revoke_pack_distribution(uuid)','public.authorize_pack_distribution(uuid,uuid,uuid,text,text,jsonb)','public.open_shared_information_pack_item(uuid,uuid)','public.prepare_qualified_contact(uuid,text,text,uuid)','public.read_shared_information_pack(uuid)','public.read_shared_pack_item_material(uuid,uuid)','public.record_information_pack_revision(uuid,uuid,jsonb)','public.record_pack_distribution_next_step(uuid,text,text)','public.record_pack_recipient_response(uuid,text,text,numeric,text,integer,text,numeric,numeric,jsonb,jsonb,uuid)','public.release_qualified_contact(uuid,text)','public.resolve_pack_distribution_candidates(uuid,uuid)','public.revoke_pack_distribution(uuid)']loop
  target:=to_regprocedure(signature);
  if target is not null then execute format('revoke all on function %s from public,anon,authenticated,service_role',target);end if;
 end loop;
 foreach name in array array['public.information_pack_items','public.information_pack_revisions','public.pack_access_events','public.pack_distribution_authorizations','public.pack_distribution_next_steps','public.pack_distribution_shares','public.pack_recipient_responses','public.qualified_contact_preparations']loop
  relation:=to_regclass(name);
  if relation is not null then execute format('revoke all on table %s from public,anon,authenticated,service_role',relation);end if;
 end loop;
 if to_regclass('public.pack_access_events')is not null then execute 'drop policy if exists pack_access_events_recipient_select on public.pack_access_events';end if;
 if to_regclass('public.pack_recipient_responses')is not null then execute 'drop policy if exists pack_recipient_responses_recipient_select on public.pack_recipient_responses';end if;
end;$$;
