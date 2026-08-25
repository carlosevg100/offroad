-- A client may not have a material at all. Recording that fact is more useful than leaving an
-- unexplained red item, but it does not satisfy the requirement. It remains open and informs
-- the desk's next-best-action policy.

alter table public.intake_information_answers
  drop constraint if exists intake_information_answers_response_check;

alter table public.intake_information_answers
  add constraint intake_information_answers_response_check
  check (response in ('provided', 'partial', 'not_applicable', 'after_nda', 'unavailable'));

alter table public.intake_information_answers
  drop constraint if exists intake_information_answers_unavailable_needs_reason;

alter table public.intake_information_answers
  add constraint intake_information_answers_unavailable_needs_reason
  check (response <> 'unavailable' or coalesce(btrim(note), '') <> '');

comment on column public.intake_information_answers.response is
  'Client-declared status. unavailable is recorded and remains open; it never satisfies a requirement.';
