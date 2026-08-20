-- ---------------------------------------------------------------------------------------------
-- The worker can finally record what it extracted.
--
-- `public.worker_record_candidates` is a `security invoker` wrapper, so calling it runs as the
-- caller and the caller needs execute on the private implementation it delegates to. That grant
-- was never issued, while its six siblings had it. The wrapper was granted, which made the gap
-- invisible to anything that checked the public surface.
--
-- Proven against this project by calling both as `authenticated`:
--
--   public.worker_record_candidates -> "permission denied for function worker_record_candidates"
--   public.worker_claim_job         -> "worker_token_invalid"   (reached the body, refused the token)
--
-- So every real run would download, scan, parse, classify and extract, spend the model budget,
-- and then die at the last write. Production holds 0 intake_field_candidates, which is consistent
-- with a line that has never completed once.
--
-- This is not a privilege widening. The private function is `security definer` and validates the
-- per-job capability token itself before touching anything, which is the same protection every
-- other worker command relies on. What was missing was the ability to reach that check at all.
-- ---------------------------------------------------------------------------------------------

grant execute on function private.worker_record_candidates(uuid, text, jsonb) to authenticated;

-- `worker_identity` stays unreachable on purpose: it is called from inside `worker_claim_job`,
-- never from outside, and it maps a raw token to a service account. There is no caller that needs
-- it and no reason to let one exist.
revoke execute on function private.worker_identity(text) from authenticated;
