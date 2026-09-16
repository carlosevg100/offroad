-- The base stage-3 migration registered the same capture function twice on purpose updates.
-- Keep the first trigger so one logical mutation produces one audit/outbox event.
drop trigger resource_policy_event on private.access_resources;
