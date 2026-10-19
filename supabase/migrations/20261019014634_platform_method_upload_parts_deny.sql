-- The upload parts are operator-only, like the other publication tables: an explicit deny policy.
create policy platform_method_upload_parts_deny on private.platform_method_upload_parts as restrictive for all to public using (false) with check (false);
