-- Cover the two tenant-scoped foreign keys used when a project or processing job
-- is removed. Existing indexes cover id, object_path and active worker grants,
-- but neither complete (organization_id, referenced_id) lookup below.
create index capital_material_upload_grants_project_fk_idx
  on private.capital_project_material_upload_grants (organization_id, capital_project_id);

create index capital_material_upload_grants_job_fk_idx
  on private.capital_project_material_upload_grants (organization_id, processing_job_id);
