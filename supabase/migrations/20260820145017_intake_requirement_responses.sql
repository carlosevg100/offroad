-- ---------------------------------------------------------------------------------------------
-- A company can close an item without uploading a file.
--
-- The checklist had two states, sent and missing, which makes a company look delinquent for
-- things that genuinely do not apply to it — a business selling only for cash has no
-- receivables ageing, and a permanently red mark against it trains people to ignore the entire
-- list. It also had nowhere to put the most common real answer: "last year's is attached, this
-- year's is with the auditor".
--
-- The table already recorded what the company said about a requirement; it now records the
-- status alongside the content, for document items as well as questions.
-- ---------------------------------------------------------------------------------------------

alter table public.intake_information_answers
  add column if not exists response text not null default 'provided',
  add column if not exists note text;

alter table public.intake_information_answers
  drop constraint if exists intake_information_answers_response_check;
alter table public.intake_information_answers
  add constraint intake_information_answers_response_check
  check (response in ('provided', 'partial', 'not_applicable', 'after_nda'));

-- A document item's answer is the file, so the text may be empty for those.
alter table public.intake_information_answers alter column answer drop not null;

-- Nothing closes an item. A row with neither an answer nor a note is a company making the
-- red mark go away, which is worse than the red mark.
alter table public.intake_information_answers
  drop constraint if exists intake_information_answers_carries_something;
alter table public.intake_information_answers
  add constraint intake_information_answers_carries_something
  check (coalesce(btrim(answer), '') <> '' or coalesce(btrim(note), '') <> '');

-- "Does not apply" without a reason tells an investor nothing except that somebody wanted the
-- item gone. The justification is the whole value of the answer.
alter table public.intake_information_answers
  drop constraint if exists intake_information_answers_not_applicable_needs_reason;
alter table public.intake_information_answers
  add constraint intake_information_answers_not_applicable_needs_reason
  check (response <> 'not_applicable' or coalesce(btrim(note), '') <> '');

comment on table public.intake_information_answers is
  'What the company said about one requirement: an answer, a status, or both. Covers document items as well as questions — a document item appears here only when the company is telling us something other than "here is the file".';
