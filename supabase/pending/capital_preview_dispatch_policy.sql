-- Closed observed request policy for the two actual paid preview boundaries.
-- This pure registry is not a processing grant. Input bytes must be derived by
-- the native boundary command from its physically retained request, never caller budget claims.
set search_path='';
create function private.capital_preview_dispatch_policy_v1(p_boundary text,p_model text,p_input_bytes bigint)
returns jsonb language plpgsql immutable security definer set search_path=''as $$
declare provider text;effort text;system_sha text;system_bytes bigint;schema_fp text;schema_bytes bigint;output_tokens bigint;timeout_ms bigint;
 pricing_wire text;tuple jsonb;wire text;output_rate bigint;bound bigint;
begin
 if p_boundary is null or p_boundary not in('questions','synthesis')or p_model is null or p_model not in('claude-sonnet-5','gpt-5.6-terra')
 or p_input_bytes is null or p_input_bytes not between 1 and 100000 then raise exception 'capital_preview_policy_invalid'using errcode='22023';end if;
 provider:=case when p_model='claude-sonnet-5'then'anthropic'else'openai'end;
 effort:=case when p_boundary='questions'then'low'else'medium'end;
 system_sha:=case when p_boundary='questions'then'a3508e2274b4346bf9376a2d39d9fcf26ff08c3230a6261b8a00e6a342fe8976'else'735cd41c4bed59b528c1d13782316a92f54a85305e61dd3e195e305ff031b468'end;
 system_bytes:=case when p_boundary='questions'then 1064 else 1176 end;
 schema_fp:=case when p_boundary='questions'then'b594c9bd033252269569fa0f18ae6a56898e66a0fc5a0d1488fbfbda982a2fba'else'e29b92a530dd7aaae1eca548ab307950299146897a70b9ccf69d146796efb3d0'end;
 schema_bytes:=case when p_boundary='questions'then 935 else 865 end;
 output_tokens:=case when p_boundary='questions'then 2000 else 6000 end;
 timeout_ms:=case when p_boundary='questions'then 60000 else 120000 end;
 output_rate:=case when p_model='claude-sonnet-5'then 10000000 else 12000000 end;
 pricing_wire:=case when p_model='claude-sonnet-5'then'{"cacheWrite":2.5,"cachedInput":0.2,"input":2,"longContext":null,"output":10}'else'{"cacheWrite":2.5,"cachedInput":0.2,"input":2,"longContext":{"aboveInputTokens":272000,"inputMultiplier":2,"outputMultiplier":1.5},"output":12}'end;
 tuple:=jsonb_build_array('capital-preview-dispatch-policy.v1',p_boundary,provider,p_model,effort,system_sha,system_bytes,schema_fp,schema_bytes,output_tokens,timeout_ms);
 select '['||string_agg(x.value::text,','order by x.ordinality)||','||pricing_wire||']'into wire from jsonb_array_elements(tuple)with ordinality x(value,ordinality);
 -- Logical JSON schemas exceed actual strict provider schemas (731/638B).
 -- Byte-to-token upper bound + framing + 10 percent headroom; no fake cache discount.
 bound:=ceil(((p_input_bytes+system_bytes+schema_bytes+1024)::numeric*2500000+output_tokens::numeric*output_rate)*11/10000000)::bigint;
 return jsonb_build_object('policyFingerprint',encode(extensions.digest(wire,'sha256'),'hex'),'taskId',case when p_boundary='questions'then'A01'else'A02'end,
 'task',case when p_boundary='questions'then'preview_questions'else'preview_synthesis'end,'schemaName',case when p_boundary='questions'then'preview_questions_output'else'preview_synthesis_output'end,
 'maxOutputTokens',output_tokens,'timeoutMs',timeout_ms,'serverBoundMicroUsd',bound);
end;$$;
revoke all on function private.capital_preview_dispatch_policy_v1(text,text,bigint)from public,anon,authenticated,service_role;
