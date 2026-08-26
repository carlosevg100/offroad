-- Foreign-key coverage for the append-only Agent ledgers. These are not primary access paths,
-- but indexing them keeps user removal and audit investigations from scanning the full ledger.

create index agent_conversations_created_by_fk_idx
  on public.agent_conversations (created_by);
create index agent_messages_created_by_fk_idx
  on public.agent_messages (created_by);
