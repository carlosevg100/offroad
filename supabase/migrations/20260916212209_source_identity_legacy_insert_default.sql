-- The legacy opportunity upload omits logical_source_id. Its BEFORE INSERT trigger already
-- registers the source and immutable version atomically. Keep the generated Insert contract
-- compatible without granting clients any new column or widening their authority.
alter table public.source_documents alter column logical_source_id set default gen_random_uuid();
