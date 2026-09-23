-- Cross-language transport vectors: same JSON.stringify layout as pinned preparation.
begin;
\set scope_vectors `cat packages/testing-fixtures/assets/receivables-preparation/scope-hash-vectors.json`
create temporary table r01_scope_vectors(payload jsonb);
insert into r01_scope_vectors values(:'scope_vectors'::jsonb);
do $$declare x jsonb;begin
 if (select payload->>'synthetic' from r01_scope_vectors) is distinct from 'true' then raise exception 'Fixture must be synthetic';end if;
 for x in select v from r01_scope_vectors,jsonb_array_elements(payload->'vectors') v loop
  if private.r01_scope_dataset_hash_v1(x->'scope') is distinct from x->>'hash' then raise exception 'R01 scope serialization differs: %',x->>'label';end if;
  raise notice 'PASS: R01 scope JSON byte parity %',x->>'label';
 end loop;
end $$;
select 'r01_scope_hash: PASS' result;
rollback;
