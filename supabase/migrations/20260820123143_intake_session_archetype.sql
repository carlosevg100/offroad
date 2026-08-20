-- Which operation the company is asking for.
--
-- The playbook's checklist, the analysis foci, the standing questions and the structure bands
-- all depend on this one answer, and until now nothing recorded it: the pipeline read the
-- documents without knowing whether it was looking at an expansion or a refinancing, which is
-- like a desk reading a data room without having asked what the money is for.
--
-- Null means "not yet stated" and the desk treats it as the generic archetype, whose first
-- deliverable is to frame the operation rather than structure it. The company sets it at the
-- start of intake; a maintainer can correct it.
alter table public.document_intake_sessions
  add column if not exists archetype text
  check (archetype is null or archetype in (
    'working_capital', 'growth_expansion', 'acquisition', 'refinance', 'equipment_finance', 'other'
  ));

comment on column public.document_intake_sessions.archetype is
  'Deal archetype from packages/credit-playbook. Drives the minimum/ideal checklist, the analysis foci and the standing questions. Null = not yet stated; treated as the generic archetype.';
