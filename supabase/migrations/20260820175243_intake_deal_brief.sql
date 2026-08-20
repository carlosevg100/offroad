-- ---------------------------------------------------------------------------------------------
-- The deal brief: the one page that decides everything downstream.
--
-- Until now a session knew only its archetype — what the money is for. That drives the checklist,
-- and it is not enough to say anything about who would buy the paper. Amount, tenor, sector,
-- geography, the instruments the operation could take and what the company can pledge are the six
-- facts that let a desk answer the question worth the most at the start: does this find a buyer at
-- all, and if not, what changes that.
--
-- Six columns rather than a jsonb blob, because each one is a constrained value that other things
-- will filter and join on, and because a check constraint is a promise the database keeps even
-- when a future code path forgets to.
--
-- Every column is nullable on purpose. The brief is filled in over a conversation, not submitted;
-- a partial brief is the normal state and the fit assessment is built to answer from it.
-- ---------------------------------------------------------------------------------------------

alter table public.document_intake_sessions
  add column if not exists requested_amount numeric(18, 2) check (requested_amount is null or requested_amount > 0),
  add column if not exists requested_term_months integer check (requested_term_months is null or requested_term_months between 1 and 360),
  add column if not exists requested_grace_months integer check (requested_grace_months is null or requested_grace_months between 0 and 120),
  add column if not exists sector text,
  -- A two-letter UF, or 'BR' when the operation is national.
  add column if not exists geography text check (geography is null or geography ~ '^[A-Z]{2}$'),
  add column if not exists instruments text[],
  add column if not exists collateral_kinds text[];

-- The vocabularies are the same ones `@offroad/fund-mandate` compares against. Keeping them in a
-- constraint means a typo in a form cannot quietly produce a request that matches no fund for a
-- reason nobody can see.
alter table public.document_intake_sessions
  drop constraint if exists document_intake_sessions_instruments_known;
alter table public.document_intake_sessions
  add constraint document_intake_sessions_instruments_known
  check (
    instruments is null
    or instruments <@ array[
      'debenture', 'nota_comercial', 'ccb', 'cri', 'cra', 'fidc',
      'direct_loan', 'receivables_purchase', 'project_finance', 'equity_kicker_debt'
    ]::text[]
  );

alter table public.document_intake_sessions
  drop constraint if exists document_intake_sessions_collateral_known;
alter table public.document_intake_sessions
  add constraint document_intake_sessions_collateral_known
  check (
    collateral_kinds is null
    or collateral_kinds <@ array[
      'recebiveis', 'imovel', 'equipamento', 'estoque', 'aval_fianca',
      'cessao_fiduciaria', 'alienacao_fiduciaria_quotas', 'conta_reserva', 'quirografario'
    ]::text[]
  );

-- Grace cannot outlast the facility it is inside.
alter table public.document_intake_sessions
  drop constraint if exists document_intake_sessions_grace_within_term;
alter table public.document_intake_sessions
  add constraint document_intake_sessions_grace_within_term
  check (
    requested_grace_months is null
    or requested_term_months is null
    or requested_grace_months < requested_term_months
  );

comment on column public.document_intake_sessions.instruments is
  'Instruments the operation could take. Several is normal: in Brazil the instrument decides which vehicles may hold the paper, so keeping options open widens the buyer set.';
