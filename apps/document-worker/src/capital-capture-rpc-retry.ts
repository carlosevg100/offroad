/** Retry only the server's explicit transient lock conflict, with unchanged authority. */
export async function retryCapitalCaptureRpc<T extends {error: unknown}>(command: () => PromiseLike<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const result = await command();
    const error = result.error && typeof result.error === "object"
      ? result.error as {code?: unknown; message?: unknown} : null;
    if (error?.code !== "40001" || error.message !== "capital_capture_retry" || attempt === 7) return result;
    await new Promise(resolve => setTimeout(resolve, Math.min(25 * 2 ** attempt, 200)));
  }
}
