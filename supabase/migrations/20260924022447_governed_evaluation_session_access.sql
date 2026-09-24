-- Stage 17, increment 5: the evaluator's own entry point to governed evaluations. The request and
-- read commands stay operator-surface commands that name their actor explicitly. These session
-- commands take the actor from the signed session (auth.uid()) and never from an argument, refuse
-- unless that session belongs to a live evaluator principal, and then delegate to the operator
-- commands with that identity, which check the evaluator again under a shared row lock.
set search_path='';

-- Security definer so the delegated operator commands run on the operator surface; the only
-- identity that reaches them is the session's own, and only after it proved to be an evaluator.
create function private.request_governed_evaluation_session_v1(p_contract_text text,p_snapshot_text text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid();begin
 if actor is null or not private.platform_evaluator_live_v1(actor) then raise exception 'evaluator_session_required' using errcode='42501';end if;
 return private.request_governed_evaluation_v1(p_contract_text,p_snapshot_text,actor);
end $$;

create function private.read_governed_evaluation_session_v1(p_execution_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid();begin
 if actor is null or not private.platform_evaluator_live_v1(actor) then raise exception 'evaluator_session_required' using errcode='42501';end if;
 return private.read_governed_evaluation_v1(p_execution_id,actor);
end $$;

-- Invoker wrappers: reaching an implementation takes both grants, like every public wrapper.
create function public.request_governed_evaluation_session_v1(p_contract_text text,p_snapshot_text text) returns jsonb
language sql volatile security invoker set search_path='' as $$ select private.request_governed_evaluation_session_v1(p_contract_text,p_snapshot_text); $$;
create function public.read_governed_evaluation_session_v1(p_execution_id uuid) returns jsonb
language sql volatile security invoker set search_path='' as $$ select private.read_governed_evaluation_session_v1(p_execution_id); $$;

-- Signed-in sessions only: the wrappers and the implementations they delegate to, nothing else.
revoke all on function private.request_governed_evaluation_session_v1(text,text),private.read_governed_evaluation_session_v1(uuid),
 public.request_governed_evaluation_session_v1(text,text),public.read_governed_evaluation_session_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function private.request_governed_evaluation_session_v1(text,text),private.read_governed_evaluation_session_v1(uuid),
 public.request_governed_evaluation_session_v1(text,text),public.read_governed_evaluation_session_v1(uuid) to authenticated;

comment on function public.request_governed_evaluation_session_v1(text,text) is 'Evaluator session request of a governed evaluation: the actor is auth.uid(), never an argument.';
comment on function public.read_governed_evaluation_session_v1(uuid) is 'Evaluator session read of a governed evaluation: the actor is auth.uid(), never an argument.';
