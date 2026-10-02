begin;
set local search_path='';
do $$declare r jsonb;boundary text;model text;expected text;begin
 for boundary,model,expected in values
 ('questions','claude-sonnet-5','5afda6437481926a375d5aae337e0ec32d0b45735d2a72cb3227069f081548c1'),
 ('questions','gpt-5.6-terra','46577953d74a0f63d87f1b63de83dfadce1feb4fbadff77254b5bf692028bcac'),
 ('synthesis','claude-sonnet-5','d22aaa245d01ad9a3524707c2149d73c2acd571feecefe118b874ed73b6b56f8'),
 ('synthesis','gpt-5.6-terra','11a3b9bd3a6805bbeec802a020fccb4c5be54b75e31ad6dd4f71d7342ddd7baa')loop
 r:=private.capital_preview_dispatch_policy_v1(boundary,model,100000);
 if r->>'policyFingerprint'<>expected or(r->>'serverBoundMicroUsd')::bigint<=0 then raise exception 'preview_common_Node_SQL_policy_parity_failed';end if;
 if (private.capital_preview_dispatch_policy_v1(boundary,model,10000)->>'serverBoundMicroUsd')::bigint>=(r->>'serverBoundMicroUsd')::bigint then raise exception 'preview_actual_physical_input_bound_missing';end if;
 end loop;
 begin perform private.capital_preview_dispatch_policy_v1('other','gpt-5.6-terra',10000);raise exception 'preview_unknown_boundary';exception when invalid_parameter_value then null;end;
 begin perform private.capital_preview_dispatch_policy_v1('synthesis','gpt-5.6-sol',10000);raise exception 'preview_unknown_model';exception when invalid_parameter_value then null;end;
 begin perform private.capital_preview_dispatch_policy_v1('synthesis','gpt-5.6-terra',100001);raise exception 'preview_input_limit_relaxed';exception when invalid_parameter_value then null;end;
end$$;
set local role authenticated;
do $$begin
 begin perform private.capital_preview_dispatch_policy_v1('questions','claude-sonnet-5',10000);raise exception 'preview_private_policy_exposed';exception when insufficient_privilege then null;end;
end$$;
reset role;
rollback;
