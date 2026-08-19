/**
 * Waiting, done in a way that keeps the worker alive.
 *
 * This looks like a utility and is really the difference between a worker and a process that
 * exits. The idle poll is the only thing pending when the queue is empty, so if its timer is
 * unreferenced Node sees an event loop with nothing to wait for and exits — cleanly, with
 * status 0, in the middle of the `await`. ECS reads that as a healthy container that finished
 * and starts another one, forever. The timer here is deliberately left referenced.
 *
 * The signal is what keeps shutdown quick anyway: SIGTERM aborts the wait instead of letting
 * the loop sit out the rest of the poll interval.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    };

    // No `unref()` here. See above — it is the whole reason this function has a comment.
    const timer = setTimeout(finish, ms);
    signal?.addEventListener("abort", finish, {once: true});
  });
}
