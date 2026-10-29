-- Admit the measured 16k field windows without removing any spend or authorization bound.
-- Only defaults change: existing jobs keep their recorded budget, and the monthly ceiling,
-- the monthly ceiling, 500-call maximum and 50-call document maximum remain enforced.
-- The run ceiling becomes 30 USD: 3.10 + 8 x 3.15 = 28.30 covers an eight-document room.
-- Current worker images still impose their old 1.60 / 8 ceiling until the verified deploy.
do $document_budget$
declare
  body text;
  old_text constant text := $old$effective_budget := jsonb_build_object(
    'max_cost_usd', 16,
    'max_calls', 160,
    'document_max_cost_usd', 1.60,
    'document_max_calls', 8,
    'case_max_cost_usd', 3.10,
    'case_max_calls', 4
  ) || coalesce(p_budget, '{}'::jsonb);$old$;
  new_text constant text := $new$effective_budget := jsonb_build_object(
    'max_cost_usd', 30,
    'max_calls', 500,
    'document_max_cost_usd', 3.15,
    'document_max_calls', 50,
    'case_max_cost_usd', 3.10,
    'case_max_calls', 4
  ) || coalesce(p_budget, '{}'::jsonb);$new$;
begin
  select pg_get_functiondef('private.begin_processing_run(uuid,uuid,text,jsonb,text,jsonb)'::regprocedure) into body;
  if strpos(body,new_text)>0 and strpos(body,old_text)=0 then return; end if;
  if (length(body)-length(replace(body,old_text,'')))/length(old_text)<>1 then
    raise exception 'document_processing_budget_contract_changed';
  end if;
  body := replace(body,old_text,new_text);
  if (length(body)-length(replace(body,$bound$(effective_budget->>'max_cost_usd')::numeric > 25$bound$,'')))/length($bound$(effective_budget->>'max_cost_usd')::numeric > 25$bound$)<>1 then
    raise exception 'document_processing_budget_bound_changed';
  end if;
  execute replace(body,$bound$(effective_budget->>'max_cost_usd')::numeric > 25$bound$,$bound$(effective_budget->>'max_cost_usd')::numeric > 30$bound$);
end $document_budget$;
