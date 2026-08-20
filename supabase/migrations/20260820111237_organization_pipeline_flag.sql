-- Which extractor an organization gets, decided per organization, in the database.
--
-- The P1 plan always specified a per-organization switch, and the first implementation used a
-- deployment environment variable instead — which makes the choice global, invisible to the
-- product, and changeable only by whoever can redeploy. This is the switch the plan asked for:
-- readable by the members of the organization (the review screen can say which extractor ran),
-- writable by nobody through the Data API. Turning it on for one tenant is an update of a
-- boolean, not a deployment.
alter table public.organizations
  add column if not exists pipeline_enabled boolean not null default false;

comment on column public.organizations.pipeline_enabled is
  'When true, document intake runs the F1 pipeline (worker, anchored extraction) instead of the content-hash fixture. Per organization by design: promotion is gradual and reversible. Only a maintainer changes it — the column is not writable through the Data API.';

revoke update (pipeline_enabled) on table public.organizations from authenticated;
