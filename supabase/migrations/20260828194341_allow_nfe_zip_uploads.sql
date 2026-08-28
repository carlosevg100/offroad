-- NF-e archives are first-class evidence for the receivables vertical. The worker already
-- unpacks and normalizes them; the private intake bucket must therefore admit the two MIME
-- labels browsers commonly attach to a .zip file. No archive is made public by this change.
update storage.buckets
set allowed_mime_types = case
  when allowed_mime_types is null then array['application/zip', 'application/x-zip-compressed']::text[]
  else (
    select array_agg(mime order by mime)
    from (
      select distinct unnest(allowed_mime_types || array[
        'application/zip',
        'application/x-zip-compressed'
      ]::text[]) as mime
    ) accepted
  )
end
where id = 'opportunity-documents';
