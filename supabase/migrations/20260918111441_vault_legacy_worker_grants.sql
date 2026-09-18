-- The legacy platform corpus is read by bounded SECURITY DEFINER retrieval commands.
-- No runtime service credential may fabricate an approval or rewrite its evidence bytes.
revoke all on public.house_playbook_versions,public.house_playbook_chunks from service_role;
