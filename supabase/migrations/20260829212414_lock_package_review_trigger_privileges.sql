-- Trigger functions are invoked by Postgres and are never an application capability.
revoke all on function private.enforce_package_review_material_dependency()
  from public, anon, authenticated;

