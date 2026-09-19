-- A pending candidate cannot shadow an imported/published base or reuse its method version.
do $patch$
declare body text;anchor text;guard text;begin
 body:=pg_get_functiondef('private.submit_platform_method_candidate_v1(uuid,text,jsonb,text)'::regprocedure);
 anchor:=' insert into private.platform_method_candidates(id,release_id,method_id,version,bundle,fingerprint,author)';
 guard:=' if exists(select 1 from private.platform_method_releases where id=p_release_id or (method_id=p_bundle->''manifest''->''procedure''->>''id'' and version=p_bundle->''manifest''->''procedure''->>''version'')) then raise exception ''platform_method_identity_already_published'' using errcode=''22023'';end if;';
 if position(anchor in body)=0 then raise exception 'platform_method_identity_anchor_missing';end if;
 execute replace(body,anchor,guard||chr(10)||anchor);
end $patch$;
