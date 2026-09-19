-- Synthetic only; caller owns transaction and must roll back or use disposable local CI.
create temporary table platform_method_fixture as
select 'b5141000-0000-4000-9000-000000000001'::uuid id,
 'synthetic-platform-method-2026.09.19-v1'::text release_id,
 jsonb_build_object('schemaVersion','compiled-procedure-manifest.v1','procedure',jsonb_build_object('id','synthetic-platform-method','version','2026.09.19-v1','maturity','tested'),
 'authoringStatus','ready_for_review','pendingContent','[]'::jsonb,'grantsExecution',false,
 'components',jsonb_build_array(jsonb_build_object('component',jsonb_build_object('id','synthetic.framing','version','2026.09.19-v1','kind','narrative',
 'invariants','["law","contractual_definition","traceability","verification","access_barriers","deterministic_financial_math"]'::jsonb,
 'rights',jsonb_build_object('inheritSourceRestrictions',true),'overridePoints','[]'::jsonb)))) manifest;
alter table platform_method_fixture add column bundle jsonb;
alter table platform_method_fixture add column fingerprint text;
update platform_method_fixture set bundle=jsonb_build_object('manifest',manifest||jsonb_build_object('manifestHash',encode(extensions.digest(manifest::text,'sha256'),'hex')),
 'manifestText',manifest::text,'components',jsonb_build_array(manifest->'components'->0->'component'),
 'evidence',jsonb_build_array(jsonb_build_object('path','packages/credit-playbook/knowledge/reviews/synthetic-platform-technical.json','hash',repeat('a',64)),jsonb_build_object('path','packages/credit-playbook/knowledge/reviews/synthetic-platform-approval.json','hash',repeat('b',64))),
 'sourceCommit',repeat('c',40));
update platform_method_fixture set fingerprint=private.submit_platform_method_candidate_v1(id,release_id,bundle,'Synthetic author');
