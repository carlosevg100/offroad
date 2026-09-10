-- Synthetic loopback E2E only: opens the released R01 reading for this test organization, the
-- same way an operator opens it in the product. This is not a migration and it grants nothing
-- outside the local stack; the concession exposes a calculation and never an external effect.
begin;
select set_config('offroad.release_session', :'session_id', true);
select set_config('offroad.release_owner', :'owner_email', true);
do $$
declare s public.document_intake_sessions;
begin
 select intake.* into strict s from public.document_intake_sessions intake join auth.users u on u.id=intake.started_by
 where intake.id=current_setting('offroad.release_session')::uuid
   and u.email=current_setting('offroad.release_owner') and u.email like 'e2e-%@example.com';
 insert into private.receivables_analytical_release_grants (organization_id, granted_by, note)
 values (s.organization_id, 'e2e-local-harness', 'Synthetic loopback grant for the released R01 reading.')
 on conflict (organization_id) do update set enabled = true, updated_at = now();
end $$;
commit;
