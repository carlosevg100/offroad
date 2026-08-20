-- The pipeline is the path now; the fixture is the fallback being retired.
--
-- The column defaulted to false so that adding it changed nothing. That was right for the
-- migration and wrong for the product: an organization created today would silently land on
-- the content-hash fixture, which proposes nothing for any document set it does not recognise
-- — a new company would sign up and be told its data room is empty.
--
-- The switch itself does not change: it stays per organization, off-able for any tenant whose
-- runs are not good enough, and not writable through the Data API. Only the default moves.
-- When the product has tenants who are not us, this default goes back to false and promotion
-- becomes explicit again.
alter table public.organizations
  alter column pipeline_enabled set default true;

comment on column public.organizations.pipeline_enabled is
  'Which extractor this organization gets: true = the F1 pipeline (worker, anchored extraction), false = the content-hash fixture. Per organization by design, so a tenant can be moved back without a deployment. Defaults to true while the platform is pre-launch and the fixture is being retired; when real tenants arrive this default returns to false and promotion becomes explicit. Not writable through the Data API — a tenant cannot promote itself.';
