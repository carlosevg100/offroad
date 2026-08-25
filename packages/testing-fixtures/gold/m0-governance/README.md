# M0 governance gold cases

These synthetic cases pin the boundary between machine observation and authoritative case state.

1. A document-supported entity is a suggestion. It enters analysis scope only after an authorized tenant member confirms its role.
2. An authorization document can support an advisor declaration. It cannot verify the advisor or enlarge the declared authority.
3. Revocation is terminal. It removes every active scope and blocks any downstream action that depends on that authority.

The executable fixture lives in `src/m0-governance.ts`. Replay, worker filtering and database isolation are tested in their owning packages so the gold case does not become a second implementation of the rule.

