-- Cover version lineage lookups without scanning immutable contribution history.
create index assumption_items_version_fk_idx on private.assumption_version_items(organization_id,set_id,version_id);
