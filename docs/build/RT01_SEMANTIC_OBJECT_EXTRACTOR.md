# RT-01 - Semantic Object Extractor and governed work context

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
   for interpretation, and an optional control-plane-governed active-work context.
3. The extractor emits atomic candidates, context references, unresolved references and explicit
   exclusions. It never emits canonical converted numbers.
4. `compileSemanticObjects` verifies every UTF-16 span, accepts new objects only from the current
   user turn, imports continuity only through active governed references, normalizes supported
   slots and checks quantitative plus independent semantic-head coverage.
5. `applySemanticObjectCompilation` replaces only the classifier's object field. Incomplete or
   rejected coverage clears asserted object meaning and forces abstention downstream.

## Ordering and continuity

New objects can only be established by the latest message and come first. Recent conversation can
help the model interpret a turn, but neither prior user prose nor assistant prose is admissible
evidence for a new object. Continuity is imported exclusively through an `active-work-context.v2`
reference triggered by words in the current turn; governed objects are appended in stable context
order. Pronouns and ellipses without one governed referent remain named unresolved references.

The context is not conversational memory. The control plane binds it to an organization, project,
objective id and revision fingerprint, and source-manifest id and fingerprint. The manifest lists
the admissible document and evidence-object ids. Runtime rejects tenant, project, objective,
manifest or available-document mismatches before either model call. The worker constructs this
context only from capability-scoped project, signed visible execution brief and source manifest;
free-form history and professional profile fields are not reimported.

Conversation roles are preserved end to end in runtime and gold inputs. Gold continuity fixtures
carry an independently authored governed context; they do not derive context objects from the
expected oracle or from assistant summaries. The binding also carries the control-plane document
and evidence-object allowlists plus a recomputable membership fingerprint. Runtime recomputes and
compares both memberships, so adding an otherwise schema-valid foreign source id fails before a
provider call even if the visible manifest id and revision fingerprints still match.
The same control-plane binding contains a sorted allowlist of object ids and canonical
fingerprints. Each fingerprint covers the object's id, ordinal, kind, slots, label, governance
state and sorted source ids. Runtime recomputes every entry; reusing an allowed project or manifest
source id cannot smuggle different object content into the model-visible context.

## Atomicity

Every independently referable semantic head is a separate object. A company, operation, document,
asset pool and amount-bearing scenario cannot be collapsed into one record. Each named alternative
is separate. A plural document class remains one document object unless individual documents are
named; an explicit collection size is a `count` slot. Multiple modifiers that describe one head
stay on that one object.

Every accepted object has exactly one `entity` or `subject` head. A code-owned compatibility table
rejects modifiers that do not belong to the object's kind. These constraints apply equally to
provider candidates, normalized objects and governed active-context objects.

## Fail-closed coverage

The compilation is:

- `complete` only when all spans, imports, normalizations and quantitative mentions pass;
- `incomplete` when an object/referent or stated quantity is still uncovered;
- `rejected` when provenance, governance, atomicity or normalization is invalid.

Only `complete` compilations expose `usableObjects`. Diagnostic objects and named issues remain
available for observability, but a consumer cannot mistake them for accepted routing input.
An `incomplete` output containing only `no_semantic_object` and/or an attributable
`unresolved_reference` is an honest model abstention: the gateway accepts it without spending a
repair or fallback, while application still clears objects and abstains. Any uncovered semantic
head, quantity, cardinality breach or structural issue remains invalid provider output.
An explicit identifiable head cannot be hidden behind `unresolved_reference`: for example, Camil
in “Analise a Camil” is deterministically recognized and forces repair/fallback if the extractor
does not return the company object. Generic interrogatives such as “qual operação” may remain
unresolved because no operation instance was supplied.

Gold abstentions assert zero objects and are scored only when compilation is independently
`incomplete`, has no diagnostic or usable objects, and reports only a named honest-abstention
issue. Routed turns require `complete` compilation. A corpus invariant checks every expected head
against each of the 52 authored messages or its independently governed active-work fixture.
Reviewed lexical equivalents are normalized by code (`folga`/`headroom`, `case`/`operação`, and
`fundos`/`investidores`) so semantic stability never depends on rewriting the authored prompts.

The code-owned semantic coverage detector is deliberately bounded to credit-work vocabulary and
entities introduced through explicit grammar or resolved governed context. It has negative
authority only: it can prove that a detected head was omitted, claimed twice or merged, but never
creates an object or infers a route. It intentionally does not treat arbitrary capitalization,
professional titles or sentence openings as entities. Expansion of this vocabulary is measured
against the gold and adversarial corpus before promotion.

The detector coalesces only provably single referents: a provider class contained in or adjacent
to its proper name (`Banco ABC`, `banco JP Morgan`) and the bounded market phrase “precedentes e
condições de mercado”. It does not coalesce independent company, material, operation, instrument
or alternative heads.

One shared cardinality limit of 24 applies to classifier objects, extractor candidates and the
accepted envelope. Text candidates plus governed references above that limit are retained in the
bounded diagnostic compilation, marked `object_cardinality_exceeded`, and never silently sliced.
Explicit current-turn objects receive no fabricated confidence. Governed-reference application
preserves the router's calibrated confidence and caps it below certainty; a verified span proves
attribution, not semantic certainty.

## Runtime and gate status

Shadow routing now sends the same governed input to the intent classifier and semantic extractor
in parallel, compiles and applies semantic objects before production canonicalization, and stores
raw and compiled evidence separately. The independent oracle remains unchanged. A real-model gate
must still prove provider conformance and observe the bounded vocabulary on the full gold and
adversarial corpus before this boundary can be promoted from shadow operation.
