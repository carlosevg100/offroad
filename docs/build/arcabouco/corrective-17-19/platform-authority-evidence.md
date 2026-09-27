# Platform publication and profile replay authority

Status: independently reviewed, tested in staging and applied in production. Final CI, merge and deployments pending.

## Before and after

Before migration, `platform_publication_authority.sql` failed in staging with `publication accepted: last founder revoked`. `platform_operator_identity.sql` failed with `Missing expected rejection: command id cannot silently change the adapter source commit`. Both transactions rolled back completely.

After migration, both suites and the existing `platform_method_publication.sql` passed in staging. Tests cover last founder revoked, founder banned/deleted, valid identified publication, operator denied, label-only approval denied, exact replay and replay with changed adapter commit. Positive publication fixtures now use an explicitly registered synthetic founder and v2 attestation.

Staging migration `20260927133313`; production `20260927133737`. The first staging application returned a connection failure; the journal confirmed no application before retry. Installed definitions match between environments. Security advisors have no findings. No historical attribution was changed and no real method was published or activated.

The CI concurrency harness retains simultaneous-publication proof and adds both orders of founder revocation/suspension versus publication, with observed lock waits and exact publication counts. The independent review approved the implementation and requested these additional concurrency cases.

Local `pnpm check`: 44 tasks passed on Node 24.19.0. CI results will be recorded after the remote run.
