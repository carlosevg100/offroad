-- The accepted endpoint consumes the installed input identity FK from the body
-- service. Its prefix indexes do not cover the complete advisor-reported FK.
set search_path='';
do $$ begin
 if not exists(select 1 from pg_constraint c
 where c.contype='f' and c.conrelid='private.capital_body_accepted_invocations'::regclass
 and c.confrelid='private.capital_body_invocation_inputs'::regclass
 and c.conkey=array(select a.attnum from unnest(array['organization_id','input_receipt_id','invocation_id']) with ordinality n(name,position)
 join pg_attribute a on a.attrelid=c.conrelid and a.attname=n.name order by n.position)
 and c.confkey=array(select a.attnum from unnest(array['organization_id','id','invocation_id']) with ordinality n(name,position)
 join pg_attribute a on a.attrelid=c.confrelid and a.attname=n.name order by n.position)) then
 raise exception 'capital_body_accepted_input_identity_fk_changed';end if;
end; $$;
create index capital_body_accepted_input_identity_fk_idx
 on private.capital_body_accepted_invocations(organization_id,input_receipt_id,invocation_id);
