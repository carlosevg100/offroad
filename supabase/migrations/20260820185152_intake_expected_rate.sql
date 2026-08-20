-- The cost the company hoped for, as it wrote it.
--
-- Free text on purpose. A company writes a rate in whatever convention it thinks in — "13% ao
-- ano", "CDI + 4", "1,2% ao mês" — and normalising it into a number here would be pretending to a
-- precision the field does not have, on the one input where being wrong is embarrassing in front
-- of an investor.
--
-- It is recorded so it can be *answered*, never so it can be argued with by an invented rate. The
-- document that reaches an investor still carries no price; the market read belongs on the
-- internal side, supported by comparable transactions.
alter table public.document_intake_sessions
  add column if not exists expected_rate text check (expected_rate is null or length(btrim(expected_rate)) between 1 and 80);

comment on column public.document_intake_sessions.expected_rate is
  'The cost the company hoped for, in its own words. Recorded to be answered on the internal side, never to be countered with an invented rate in the investor-facing document.';
