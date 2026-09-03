-- Cover the two foreign-key access paths that are not left-prefixes of the primary key.
-- Besides delete performance, these indexes keep case cleanup and run cleanup from scanning
-- every private evidence fragment as the production corpus grows.

create index receivables_evidence_fragments_processing_run_fk_idx
  on private.receivables_evidence_fragments (organization_id, processing_run_id);

create index receivables_evidence_fragments_source_document_fk_idx
  on private.receivables_evidence_fragments (organization_id, source_document_id);
