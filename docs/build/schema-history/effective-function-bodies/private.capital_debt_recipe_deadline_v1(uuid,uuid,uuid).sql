CREATE OR REPLACE FUNCTION private.capital_debt_recipe_deadline_v1(p_org uuid, p_recipe uuid, p_subject uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare walker uuid:=p_recipe;visited uuid[]:='{}';depth integer:=0;r private.capital_debt_recipes;prior private.capital_debt_recipes;
 proof private.capital_debt_revision_inputs;a private.capital_public_payload_allocations;d timestamptz;bound timestamptz;
begin
 loop
 if walker=any(visited) or depth>=64 then return null;end if;visited:=visited||walker;depth:=depth+1;
 select * into r from private.capital_debt_recipes where organization_id=p_org and id=walker;
 if r.id is null then return null;end if;
 bound:=private.capital_debt_recipe_deadline_before_revision_v1(p_org,r.id,p_subject);
 if bound is null then return null;end if;d:=least(d,bound);
 if r.revision_decision_id is null then return d;end if;
 select * into proof from private.capital_debt_revision_inputs where organization_id=p_org and recipe_id=r.id;
 select * into prior from private.capital_debt_recipes where organization_id=p_org and id=proof.prior_recipe_id;
 if proof.recipe_id is null or prior.id is null or prior.captured_at>=r.captured_at or proof.depth>64 then return null;end if;
 select x.* into a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on(x.organization_id,x.id)=(q.organization_id,q.allocation_id)
 where q.organization_id=p_org and q.id=proof.prior_final_retained_payload_id;
 if a.id is null or not private.capital_body_physical_receipt_v1(p_org,proof.prior_final_retained_payload_id) then return null;end if;
 d:=least(d,a.expires_at,a.purge_at);if d<=clock_timestamp() then return null;end if;
 walker:=prior.id;
 end loop;
end $function$
