-- M2 part 3, sixth review round: every market command enters the authority door as its first statement,
-- before any command, job, source or chain lock and before replay handling. A transaction that holds the
-- authority exclusively is therefore refused by any command before it can wait on a lock that a queued
-- transaction holds, and a reader enters the door before taking anything a revoker could need.
-- The gate is inserted at the head of each listed body, unchanged otherwise, and each result is checked.
do $$
declare f record;d text;n integer:=0;begin
 for f in select p.oid,p.oid::regprocedure::text sig from pg_proc p join pg_namespace s on s.oid=p.pronamespace
  where s.nspname='private' and p.proname in (
   'cancel_market_acquisition_v1','enqueue_market_contract_acquisition_v1','enqueue_market_acquisition_v1',
   'grant_market_acquisition_delegation_v1','revoke_market_acquisition_delegation_v1',
   'grant_market_event_delegation_v1','revoke_market_event_delegation_v1',
   'register_market_publisher_v1','release_market_acquisition_transport_v1','record_market_source_revision_v1',
   'publish_market_odbl_release_v1','withdraw_market_odbl_release_v1','relink_market_version_v1',
   'register_market_event_consumer_v1','disable_market_event_consumer_v1','update_market_event_consumer_filter_v1','retry_blocked_market_event_v1',
   'worker_claim_market_acquisition_v1','worker_renew_market_acquisition_v1','worker_commit_market_acquisition_v1','worker_fail_market_acquisition_v1',
   'worker_commit_market_version_v1')
  order by 2
 loop
  d:=pg_get_functiondef(f.oid);
  d:=regexp_replace(d,'(AS \$function\$.*?\mbegin\M)','\1 perform private.market_require_read_committed_v1();');
  execute d;
  if (select prosrc !~ '^\s*(declare\s.*?)?\mbegin\M perform private\.market_require_read_committed_v1\(\);' from pg_proc where oid=f.oid)
  then raise exception 'market gate not at the head of %',f.sig;end if;
  n:=n+1;
 end loop;
 if n<>22 then raise exception 'market gate applied to % functions, expected 22',n;end if;
end $$;
