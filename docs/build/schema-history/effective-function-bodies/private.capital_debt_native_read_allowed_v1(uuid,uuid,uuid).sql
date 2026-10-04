CREATE OR REPLACE FUNCTION private.capital_debt_native_read_allowed_v1(p_org uuid, p_revision uuid, p_actor uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare walker uuid:=p_revision;visited uuid[]:='{}';b private.capital_debt_native_bindings;proof private.capital_debt_revision_inputs;
begin
 loop
 if walker=any(visited) or cardinality(visited)>=64 then return false;end if;visited:=visited||walker;
 if not private.capital_debt_native_read_before_revision_v1(p_org,walker,p_actor) then return false;end if;
 select * into b from private.capital_debt_native_bindings where organization_id=p_org and revision_id=walker;
 if b.id is null then return true;end if;
 select * into proof from private.capital_debt_revision_inputs where organization_id=p_org and recipe_id=b.recipe_id;
 if proof.recipe_id is null then return not exists(select 1 from private.capital_debt_recipes r where r.organization_id=p_org and r.id=b.recipe_id and r.revision_decision_id is not null);end if;
 walker:=proof.prior_revision_id;
 end loop;
end $function$
