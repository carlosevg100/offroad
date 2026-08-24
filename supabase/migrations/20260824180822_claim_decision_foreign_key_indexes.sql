create index claim_decisions_source_manifest_idx
  on public.claim_decisions (organization_id, source_manifest_id);

create index claim_decisions_decided_by_idx
  on public.claim_decisions (decided_by);
