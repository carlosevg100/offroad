-- Make the intentional private-table boundary explicit to the security advisor.
-- No table privilege is granted. Authenticated callers continue using scoped RPCs;
-- their security-definer owner retains the same database execution boundary.
create policy institutional_configs_deny_select on private.institutional_model_configurations for select to authenticated using (false);
create policy institutional_configs_deny_insert on private.institutional_model_configurations for insert to authenticated with check (false);
create policy institutional_configs_deny_update on private.institutional_model_configurations for update to authenticated using (false) with check (false);
create policy institutional_configs_deny_delete on private.institutional_model_configurations for delete to authenticated using (false);
create policy institutional_bindings_deny_select on private.institutional_information_request_bindings for select to authenticated using (false);
create policy institutional_bindings_deny_insert on private.institutional_information_request_bindings for insert to authenticated with check (false);
create policy institutional_bindings_deny_update on private.institutional_information_request_bindings for update to authenticated using (false) with check (false);
create policy institutional_bindings_deny_delete on private.institutional_information_request_bindings for delete to authenticated using (false);

-- FK lookups: the existing composite indexes already cover project, message and
-- request references. The reviewer-user FK requires its own leading-key index.
create index institutional_configs_reviewed_by_idx on private.institutional_model_configurations(reviewed_by) where reviewed_by is not null;
create index institutional_configs_parent_idx on private.institutional_model_configurations(organization_id,capital_project_id,parent_fingerprint) where parent_fingerprint is not null;
