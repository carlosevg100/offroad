-- Stage 17, increment 6: retire the settle commands that accepted only a result hash.
-- worker_settle_execution_v2 (correction 3N) records the exact bytes, the outcome and the reason of
-- the kernel run, and it is the only settle command the published worker calls
-- (apps/document-worker/src/execution-queue.ts). The hash-only path let an operation close without
-- the database ever holding its bytes. Commit already refuses to publish such a receipt as success
-- under a later lease; removing the command removes the path itself. No execution had been requested
-- in production when this ran, so no receipt was ever settled through it there. Nothing else calls
-- these functions, and the worker runtime contract lists capabilities, not these names.
set search_path='';

drop function public.worker_settle_execution_v1(uuid,text,uuid,text);
drop function private.worker_settle_execution_v1(uuid,text,uuid,text);
drop function private.settle_execution_operation_v1(uuid,text,uuid,uuid,text,text,bigint,bigint);
