# Wave 2: bounded monitoring preflight

This delivery adds a manual, main-only operation for the same AWS OIDC deployment role already inventoried. It neither changes IAM nor adds a stored credential. Default mode tests CloudWatch filter syntax and reads the four named outbox alarms. Apply mode writes only the reviewed metric filters and alarms. No customer payload or synthetic production event is sent: filter tests use an in-memory event name and aggregate counters. No notification destination is added.

Effective permission is not assumed from prior successful ECS deployments. An unavailable AWS operation blocks stage 4 publication; it is not treated as successful alarm verification. The previous worker boot-read gap remains open. The immutable opening inventory remains an opening baseline, not evidence that these new operations have already passed. Controls: least privilege, content-free telemetry, production rollout evidence and wave-bound inventory review. Existing production access boundaries, model paths and retained data are unchanged.

The implementation of stage 4 remains separate and unapplied until its delivery prerequisites are resolved. This operational PR is a preflight inside wave 2, not a completed stage 4 or authority to start another wave.
