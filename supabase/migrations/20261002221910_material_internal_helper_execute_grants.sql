-- Internal review and retention helpers are callable only by their owning server commands.
revoke all on function private.artifact_review_sources_allowed_v1(uuid,uuid,uuid), private.capital_capture_allocation_deadline_v2(uuid,uuid) from public,anon,authenticated,service_role;
