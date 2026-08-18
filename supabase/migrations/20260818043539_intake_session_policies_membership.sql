-- Fix: creating a document intake session failed under RLS.
--
-- The SELECT/UPDATE policies on `document_intake_sessions` called
-- `private.can_access_intake_session(organization_id, id)`, a STABLE function that looks the
-- session row up in the same table. For `insert … returning` (what the app does to get the new
-- session id) the SELECT policy is evaluated on the new row while the STABLE function still sees
-- the statement's initial snapshot — the row is not there yet, the policy fails and PostgREST
-- returns 42501. Net effect: "Start with documents" always ended with "could not save".
-- The end-to-end suite caught it on a fresh stack; the hosted project had zero sessions.
--
-- On the sessions table itself, "session exists in this organization" is a tautology, so the
-- policies only need the tenant/type check. `can_access_intake_session` remains the right guard
-- for child tables (candidates, issues, documents), where the session already exists.

drop policy if exists document_intake_sessions_select on public.document_intake_sessions;
create policy document_intake_sessions_select on public.document_intake_sessions for select to authenticated
  using ((select private.is_org_type_member(organization_id, array['company', 'originator', 'offroad'])));

drop policy if exists document_intake_sessions_update on public.document_intake_sessions;
create policy document_intake_sessions_update on public.document_intake_sessions for update to authenticated
  using ((select private.is_org_type_member(organization_id, array['company', 'originator', 'offroad'])))
  with check ((select private.is_org_type_member(organization_id, array['company', 'originator', 'offroad'])));

comment on policy document_intake_sessions_select on public.document_intake_sessions is
  'Borrower-side members of the tenant see its intake sessions; membership-only so insert … returning works.';
