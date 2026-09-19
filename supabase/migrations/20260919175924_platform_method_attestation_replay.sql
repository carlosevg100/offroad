-- Replaying an already recorded attestation returns the original receipt even after publication.
-- No new attestation is allowed after a publication or withdrawal decision.
do $patch$
declare body text;guard text;anchor text;begin
 body:=pg_get_functiondef('private.attest_platform_method_candidate_v1(uuid,uuid,text,text,text,jsonb)'::regprocedure);
 guard:=' if exists(select 1 from private.platform_method_publication_events where candidate_id=c.id) then raise exception ''platform_method_already_decided'' using errcode=''22023'';end if;';
 anchor:=' insert into private.platform_method_attestations(id,candidate_id,kind,candidate_fingerprint,actor,evidence)';
 if position(guard in body)=0 or position(anchor in body)=0 then raise exception 'platform_method_attestation_replay_anchor_missing';end if;
 body:=replace(body,guard,'');body:=replace(body,anchor,guard||chr(10)||anchor);execute body;
end $patch$;
