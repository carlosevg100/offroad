-- Same cases as packages/access-policy/fixtures/conformance.json; equality is a required TS test.
create temp table policy_vectors as select * from jsonb_to_recordset($vectors$[
  {
    "id": "group_descendant",
    "action": "read",
    "purpose": "retrieval",
    "expected": true
  },
  {
    "id": "barrier_blocks",
    "action": "read",
    "purpose": "retrieval",
    "expected": false
  },
  {
    "id": "group_intersection",
    "action": "work",
    "purpose": "analysis",
    "expected": true
  },
  {
    "id": "deny_over_allow",
    "action": "read",
    "purpose": "retrieval",
    "expected": false
  },
  {
    "id": "purpose_denied",
    "action": "work",
    "purpose": "analysis",
    "expected": false
  },
  {
    "id": "purpose_permitted",
    "action": "read",
    "purpose": "retrieval",
    "expected": true
  },
  {
    "id": "expired_membership",
    "action": "read",
    "purpose": "retrieval",
    "expected": false
  },
  {
    "id": "admin_no_read",
    "action": "read",
    "purpose": "retrieval",
    "expected": false
  }
]$vectors$::jsonb) as v(id text,action text,purpose text,expected boolean);
create temp table policy_results(id text primary key,actual boolean);
