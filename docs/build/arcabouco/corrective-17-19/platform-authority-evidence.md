# Platform publication and profile replay authority

Status: merged in PR 831 (10c11e14), complete Quality 36323882427 passed, both databases applied, web and worker deployed. See COMPLETION.md for the exact deployment and boot evidence.

## Before and after

Before migration, `platform_publication_authority.sql` failed in staging with `publication accepted: last founder revoked`. `platform_operator_identity.sql` failed with `Missing expected rejection: command id cannot silently change the adapter source commit`. Both transactions rolled back completely.

After migration, both suites and the existing `platform_method_publication.sql` passed in staging. Tests cover last founder revoked, founder banned/deleted, valid identified publication, operator denied, label-only approval denied, exact replay and replay with changed adapter commit. Positive publication fixtures now use an explicitly registered synthetic founder and v2 attestation.

Staging migration `20260927133313`; production `20260927133737`. The first staging application returned a connection failure; the journal confirmed no application before retry. Installed definitions match between environments. Security advisors have no findings. No historical attribution was changed and no real method was published or activated.

The CI concurrency harness retains simultaneous-publication proof and adds both orders of founder revocation/suspension versus publication, with observed lock waits and exact publication counts. The independent review approved the implementation and requested these additional concurrency cases.

Local `pnpm check`: 44 tasks passed on Node 24.19.0. The final complete Quality run is 36323882427.


Full database job 108630943027 in run 36323218921 passed. At 13:45:50 UTC, `platform_founder_revoke_revocation_first`, `platform_founder_revoke_publication_first`, `platform_founder_ban_revocation_first` and `platform_founder_ban_publication_first` all passed with observed lock waits and verified publication counts. Final independent static review found no blocker in this harness.

Live journal verification at 13:53 UTC confirmed exact file SQL in both environments for all three corrective migrations. Final catalogues retained 2,640 production and 2,701 staging objects with no unexpected contract change; security advisors remained empty in both environments.
