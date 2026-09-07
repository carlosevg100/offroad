# RT-01 - Semantic Object Extractor v1

## Why this boundary exists

The intent router decides the requested outcome and the canonical composition. It does not also
own the final decomposition of every company, operation, instrument, document, claim, model,
scenario and deliverable mentioned in the turn. The real-model RT-01 gate showed that combining
both responsibilities produced mostly correct compositions while semantic objects were merged,
omitted or reordered.

The second pass is therefore a bounded extractor, not another agent. It cannot route, answer,
plan, retrieve evidence or execute work. It emits exact user-authored spans and references to
objects already admitted by the governed active-work context. Code owns normalization, ordering,
coverage, final ids and the fingerprint.

## Runtime sequence

1. The intent classifier selects the composition and routing axes.
2. The semantic object extractor receives the latest user message, at most eight recent messages
   and an optional control-plane-governed active-work context.
3. The extractor emits atomic candidates, context references, unresolved references and explicit
   exclusions. It never emits canonical converted numbers.
4. `compileSemanticObjects` verifies every UTF-16 span against user-authored text, imports only
   active governed objects, normalizes supported slots and checks quantitative coverage.
5. `applySemanticObjectCompilation` replaces only the classifier's object field. Incomplete or
   rejected coverage clears asserted object meaning and forces abstention downstream.

## Ordering and continuity

New objects in the latest message come first. Objects needed from recent user messages follow,
with the newest message first. Governed active-work objects are appended last in their stable
context order. Assistant prose is never accepted as a source. Pronouns and ellipses without one
governed referent remain named unresolved references; they do not silently inherit a guess.

## Atomicity

Every independently referable semantic head is a separate object. A company, operation, document,
asset pool and amount-bearing scenario cannot be collapsed into one record. Each named alternative
is separate. A plural document class remains one document object unless individual documents are
named; an explicit collection size is a `count` slot. Multiple modifiers that describe one head
stay on that one object.

## Fail-closed coverage

The compilation is:

- `complete` only when all spans, imports, normalizations and quantitative mentions pass;
- `incomplete` when an object/referent or stated quantity is still uncovered;
- `rejected` when provenance, governance, atomicity or normalization is invalid.

Only `complete` compilations expose `usableObjects`. Diagnostic objects and named issues remain
available for observability, but a consumer cannot mistake them for accepted routing input.

## Integration still required

The contract and pure orchestration seam are implemented in `@offroad/agent-contracts`. The
model-gateway is intentionally unchanged in this slice. A following integration change must make
the second bounded call, preserve both provider-call records, pass the compilation through the
existing RT-01 evidence report and rerun the full real-model gate. The existing independent gold
oracle stays unchanged.
