/**
 * The worker fetches only its own storage, whatever the job payload says.
 *
 * `begin_processing_run` copies `download_url` and `layer_upload_url` from its caller into
 * the job payload, and that RPC is granted to `authenticated`. So the URLs a worker receives
 * are, in the worst case, chosen by a tenant member calling the Data API directly rather than
 * by the application that normally signs them.
 *
 * A worker that fetched them as given would be a request forwarder running inside our AWS
 * account with a task role attached. `http://169.254.170.2/v2/credentials/...` is the ECS
 * task credential endpoint, and a `layer_upload_url` pointing anywhere is where the answer
 * would be PUT. That is the whole exfiltration chain, and it needs no bug in this repository
 * beyond trusting the payload.
 *
 * The check belongs here rather than only in the database because only this process knows,
 * from its own environment and not from the message, which storage is ours. `SUPABASE_URL` is
 * configuration; the payload is input; the two are never allowed to disagree.
 */

export class UntrustedUrlError extends Error {
  constructor(readonly field: string) {
    // No URL in the message: it is attacker-chosen text heading for a log line.
    super(`the job's ${field} does not point at this deployment's storage and was refused`);
    this.name = "UntrustedUrlError";
  }
}

export type StorageUrlGuard = (field: string, url: string) => string;

/**
 * Builds the guard from the worker's own configured Supabase URL.
 *
 * Origin equality, not a substring or a suffix: `https://ref.supabase.co.attacker.com` ends
 * with nothing useful once the comparison is `URL.origin`, and userinfo (`https://ref.supabase.co@evil`)
 * parses with `origin` pointing at the real host, which is why the username and password are
 * rejected outright rather than reasoned about.
 */
export function createStorageUrlGuard(supabaseUrl: string): StorageUrlGuard {
  const expected = new URL(supabaseUrl).origin;

  return (field, url) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new UntrustedUrlError(field);
    }
    if (parsed.username !== "" || parsed.password !== "") throw new UntrustedUrlError(field);
    if (parsed.origin !== expected) throw new UntrustedUrlError(field);
    // Storage and nothing else on the same host: PostgREST, Auth and the Functions runtime
    // all live at this origin, and none of them is a document.
    if (!parsed.pathname.startsWith("/storage/v1/")) throw new UntrustedUrlError(field);
    return url;
  };
}
