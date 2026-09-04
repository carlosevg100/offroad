# Product sources of truth

The product definition, six jobs, boundaries and operating invariants live in:

- [`../build/OFFROAD_DCM_OPERATING_CONSTITUTION.md`](../build/OFFROAD_DCM_OPERATING_CONSTITUTION.md)

The canonical intent taxonomy and workflow-compilation contract live in:

- [`CANONICAL_INTENT_WORKFLOW_ATLAS.md`](CANONICAL_INTENT_WORKFLOW_ATLAS.md)

The Atlas defines how free-form user intent, context, objects, evidence, audience and authority
compile into bounded work. Personas are coverage lenses, not runtime routes.

The current company-led transaction workflow lives in:

- [`PRODUCT_WORKFLOW.md`](PRODUCT_WORKFLOW.md)

It defines the approved sequence, states, gates, loops, user decisions and visible
outputs for that route. The six entry jobs may begin with different task subgraphs,
but must converge on the same company/project objects and preserve every applicable
gate. The Atlas generalizes this route without weakening its applicable gates. Implementation,
ADRs and playbooks cannot silently alter either contract.

The broader business and positioning blueprint is:

- `Offroad_Capital_Product_Blueprint_v3.0_pt-BR.pdf`

Version: 3.0 pt-BR<br>
Date: 2026-08-14<br>
SHA-256: `6d6bc61aeaa1dc6bd42dd45b7289238925ed4087edaa5d115016871134d876de`

The DCM boundary and operating model are defined in:

- [`../adr/0012-dcm-advisory-boundary-and-client-journey.md`](../adr/0012-dcm-advisory-boundary-and-client-journey.md)
- [`../adr/0015-seven-phase-product-boundary-and-market-feedback.md`](../adr/0015-seven-phase-product-boundary-and-market-feedback.md)
- [`../build/OFFROAD_DCM_OPERATING_CONSTITUTION.md`](../build/OFFROAD_DCM_OPERATING_CONSTITUTION.md)

The House Playbook and canonical procedures define how individual activities are
performed. Architecture ADRs define how the product is implemented. They remain
separate from the journey itself.

When sources need to be reconciled, use this precedence:

1. explicit founder decisions;
2. the Constitution for product definition, entry jobs, boundaries and shared state;
3. the Intent Atlas for intent taxonomy and workflow compilation;
4. `PRODUCT_WORKFLOW.md` for the current company-led transaction route;
5. accepted ADRs for architecture and boundaries;
6. canonical House Playbook procedures for task execution;
7. the product blueprint PDF for broader product context; and
8. older handoff and build notes.
