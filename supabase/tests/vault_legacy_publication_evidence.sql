begin;
do $$ begin
 if exists(select 1 from public.house_playbook_versions where status='approved' and (approval_basis='migration' or approved_by is null)) then raise exception 'migration-only legacy treated as human publication';end if;
 if not exists(select 1 from public.house_playbook_versions where semantic_version='2026.08.24-v2' and status='draft' and legacy_publication_provenance->>'previousStatus'='approved') then raise exception 'legacy provenance not retained';end if;
 if not exists(select 1 from public.house_playbook_chunks c join public.house_playbook_versions v on v.id=c.playbook_version_id where v.semantic_version='2026.08.24-v2') then raise exception 'legacy bytes discarded';end if;
 if exists(select 1 from public.house_playbook_versions where approval_basis='migration' and private.house_usage_allowed_v1(id)) then raise exception 'legacy candidate enters retrieval';end if;
end $$;
select 'vault_legacy_publication_evidence: PASS' result;
rollback;
