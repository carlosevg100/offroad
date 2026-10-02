#!/usr/bin/env python3
"""Actual producer fixture + native dispatch SQL proof; rollback, no HTTP claim."""
from pathlib import Path
root=Path(__file__).resolve().parents[2]
source=(root/'scripts/ci/test-material-production-plan-native.py').read_text()
needle="consumer+=expand(ROOT/'supabase/tests/support/material_production_native_denials.sql')"
assert needle in source
source=source.replace(needle,"consumer+=expand(ROOT/'supabase/tests/support/material_production_dispatch.sql')+expand(ROOT/'supabase/tests/support/material_production_native_denials.sql')")
marker="assert old in s;s=s.replace(old,new)"
assert marker in source
source=source.replace(marker,"""assert old in s
new=new.replace(" else\\n"," if public.worker_read_material_production_dispatch_v1(job_id,claim->>'capability_token')->>'mode'<>'plan' then raise exception 'material_plan_dispatch_not_native';end if;raise notice 'PASS material_dispatch_prepared_plan_native_resume';\\n else\\n",1)
s=s.replace(old,new)""")
exec(compile(source,str(root/'scripts/ci/test-material-production-plan-native.py'),'exec'))
