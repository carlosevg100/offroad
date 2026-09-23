CREATE OR REPLACE FUNCTION private.attest_platform_method_candidate_v1(p_id uuid, p_candidate uuid, p_fingerprint text, p_kind text, p_actor text, p_evidence jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c private.platform_method_candidates; existing private.platform_method_attestations;begin
 perform private.require_platform_method_operator_v1();
 select * into c from private.platform_method_candidates where id=p_candidate for update;
 if c.id is null or p_fingerprint is distinct from c.fingerprint then raise exception 'platform_method_attestation_stale' using errcode='40001';end if;
 if p_id is null or p_kind not in ('technical_review','content_approval') or p_kind is null
 or p_actor is null or length(btrim(p_actor)) not between 3 and 200
 or jsonb_typeof(p_evidence) is distinct from 'object'
 or not p_evidence ?& array['sourcePath','sourceHash','occurredAt','result','manifestHash','sourceCommit','humanApproval']
 or (select count(*) from jsonb_object_keys(p_evidence))<>7
 or p_evidence->>'sourcePath' is null or p_evidence->>'sourcePath' !~ '^packages/credit-playbook/knowledge/reviews/' or p_evidence->>'sourcePath' like '%..%'
 or p_evidence->>'sourceHash' is null or p_evidence->>'sourceHash' !~ '^[a-f0-9]{64}$'
 or p_evidence->>'result' is distinct from 'approved'
 or p_evidence->>'manifestHash' is distinct from c.bundle->'manifest'->>'manifestHash'
 or p_evidence->>'sourceCommit' is distinct from c.bundle->>'sourceCommit'
 or p_evidence->>'occurredAt' is null or (p_evidence->>'occurredAt')::timestamptz>now()
 or (p_kind='content_approval' and p_evidence->'humanApproval' is distinct from 'true'::jsonb)
 or (p_kind='technical_review' and btrim(p_actor)=c.author)
 then raise exception 'platform_method_attestation_invalid' using errcode='22023';end if;
 if not exists(select 1 from jsonb_array_elements(c.bundle->'evidence') x where x->>'path'=p_evidence->>'sourcePath' and x->>'hash'=p_evidence->>'sourceHash') then raise exception 'platform_method_unpinned_attestation' using errcode='22023';end if;

 select * into existing from private.platform_method_attestations where id=p_id;
 if found then
  if existing.candidate_id<>p_candidate or existing.kind<>p_kind or existing.actor<>btrim(p_actor) or existing.evidence<>p_evidence then raise exception 'platform_method_request_reused' using errcode='22023';end if;return p_id;
 end if;
 if exists(select 1 from private.platform_method_publication_events where candidate_id=c.id) then raise exception 'platform_method_already_decided' using errcode='22023';end if;
 insert into private.platform_method_attestations(id,candidate_id,kind,candidate_fingerprint,actor,evidence) values(p_id,p_candidate,p_kind,p_fingerprint,btrim(p_actor),p_evidence);
 return p_id;
end $function$
