-- M2 part 3: the authority order refuses only the writer pattern that inverts it. A transaction that has
-- revoked or purged a version before revoking or purging an acquisition or a source holds a version
-- state before the anchor, the reverse of the readers. Versions created or evaluated earlier in the same
-- transaction are not revocation writers and keep the predecessor behaviour.
create or replace function private.anchor_market_authority_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.subject_kind in ('acquisition','source') and new.event in ('revoked','purged') then
  if exists(select 1 from private.market_events e where e.transaction_id=txid_current() and e.subject_kind='version' and e.event in ('revoked','purged'))
  then raise exception 'market_authority_order' using errcode='55000';end if;
  perform pg_advisory_xact_lock(hashtextextended('market-authority:'||new.subject_kind||':'||new.subject_id,0));
 end if;
 return new;
end $$;
revoke all on function private.anchor_market_authority_v1() from public,anon,authenticated,service_role;
