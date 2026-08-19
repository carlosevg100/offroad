-- Document layers: the app has to be able to mint the upload link
--
-- `20260818171246` created the `document-layers` bucket with a select policy and stopped
-- there; its twin, `case-artifacts`, got both select and insert. The gap only shows up at
-- the last possible moment: the worker never authenticates against Storage — it PUTs the
-- layer to a short-lived signed URL that the app mints as the authenticated user — and
-- minting that URL requires `insert` on `storage.objects`. Without this policy the app
-- cannot give the worker anywhere to put what it parsed, so the pipeline has no output.
--
-- Same scope rule as every other bucket here: `<organization_id>/<scope_id>/…`, resolved by
-- the existing path helpers, so a member of one tenant cannot mint a link into another's
-- prefix. Insert only, deliberately: each run writes its own object (the path carries a
-- fresh id), which keeps previous layers auditable and means no one needs update rights.

drop policy if exists document_layers_objects_insert on storage.objects;

create policy document_layers_objects_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'document-layers'
  and (select private.can_access_document_scope(
    private.storage_organization_id(name),
    private.storage_opportunity_id(name),
    'document.write'
  ))
);
