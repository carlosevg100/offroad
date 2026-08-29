# Product sources of truth

The canonical product journey is:

- [`PRODUCT_WORKFLOW.md`](PRODUCT_WORKFLOW.md)

It defines the approved sequence, states, gates, loops, user decisions and visible
outputs. Implementation, ADRs and playbooks cannot silently alter that topology.

The broader business and positioning blueprint is:

- `Offroad_Capital_Product_Blueprint_v3.0_pt-BR.pdf`

Version: 3.0 pt-BR<br>
Date: 2026-08-14<br>
SHA-256: `6d6bc61aeaa1dc6bd42dd45b7289238925ed4087edaa5d115016871134d876de`

The DCM boundary and operating model are defined in:

- [`../adr/0012-dcm-advisory-boundary-and-client-journey.md`](../adr/0012-dcm-advisory-boundary-and-client-journey.md)
- [`../build/OFFROAD_DCM_OPERATING_CONSTITUTION.md`](../build/OFFROAD_DCM_OPERATING_CONSTITUTION.md)

The House Playbook and canonical procedures define how individual activities are
performed. Architecture ADRs define how the product is implemented. They remain
separate from the journey itself.

When sources need to be reconciled, use this precedence:

1. explicit founder decisions;
2. `PRODUCT_WORKFLOW.md` for journey and state order;
3. accepted ADRs for architecture and boundaries;
4. canonical House Playbook procedures for task execution;
5. the product blueprint PDF for broader product context; and
6. older handoff and build notes.
