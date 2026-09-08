export type AdvisorCommandResult = {ok: true} | {ok: false; error: string};

/** Kept only in component memory: no private drafts enter browser storage or telemetry.
 * A full reload or component remount discards this state; durable recovery is a separate scope.
 * Exact retries retain their database command ID, including when acceptance was not received.
 */
export function createAdvisorCommandRecovery(createId: () => string = () => crypto.randomUUID()) {
  const attempts = new Map<string, string>();
  let pending = false;
  return {
    async run(input: {
      key: string;
      action: (messageId: string) => Promise<AdvisorCommandResult>;
      onStart: (messageId: string) => void;
      onAccepted?: () => void;
      onSettled: () => void;
      processingError: string;
      unexpectedError: string;
    }): Promise<AdvisorCommandResult> {
      // React state does not update synchronously; this lock also covers double clicks/Enter.
      if (pending) return {ok: false, error: input.processingError};
      pending = true;
      try {
        const messageId = attempts.get(input.key) ?? createId();
        attempts.set(input.key, messageId);
        input.onStart(messageId);
        const result = await input.action(messageId);
        if (result.ok) {
          attempts.delete(input.key);
          input.onAccepted?.();
        }
        return result;
      } catch {
        // A transport exception may follow a committed transaction. Never create a new ID
        // or assert rejection; let the same authorized server command reconcile the retry.
        return {ok: false, error: input.unexpectedError};
      } finally {
        pending = false;
        input.onSettled();
      }
    },
  };
}
