-- Rollback-only adapter for historical tests that seeded a capability directly, before jobs
-- required a persisted delegated principal. No production code calls this fixture helper.
insert into private.worker_tokens(id,label,token_sha256) values('a3300000-0000-4000-8000-000000000001','Synthetic legacy policy worker',extensions.digest('synthetic-policy-worker-fixture-token-v1','sha256')) on conflict(id) do nothing;
create function pg_temp.complete_synthetic_policy_lease() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='leased' then
  new.leased_by:=coalesce(new.leased_by,'a3300000-0000-4000-8000-000000000001'::uuid);
  new.leased_account_user_id:=coalesce(new.leased_account_user_id,auth.uid(),new.authorization_subject_id);
  -- Historical suites ran worker setup as postgres without a JWT. Supply the explicit
  -- synthetic lease identity only for that setup; never replace an authenticated caller.
  if auth.uid() is null and new.leased_account_user_id is not null then
   perform set_config('request.jwt.claims',jsonb_build_object('sub',new.leased_account_user_id,'role','authenticated')::text,true);
  end if;
 end if;
 return new;
end $$;
create trigger zz_synthetic_policy_lease before insert or update on public.processing_jobs for each row execute function pg_temp.complete_synthetic_policy_lease();
