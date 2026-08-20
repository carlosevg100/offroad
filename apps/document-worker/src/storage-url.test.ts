import {describe, expect, it} from "vitest";

import {createStorageUrlGuard, UntrustedUrlError} from "./storage-url";

const guard = createStorageUrlGuard("https://project.supabase.co");

const refused = (url: string) => () => guard("download_url", url);

describe("the worker fetches only its own storage", () => {
  it("passes a signed link at the configured origin", () => {
    const url = "https://project.supabase.co/storage/v1/object/sign/opportunity-documents/org/session/a.pdf?token=x";
    expect(guard("download_url", url)).toBe(url);
  });

  it("refuses the ECS task credential endpoint, which is the whole point of this file", () => {
    // `begin_processing_run` is granted to `authenticated`, so this URL can reach a worker
    // without any bug on our side beyond trusting the payload. The worker runs with a task
    // role attached, and 169.254.170.2 hands out its credentials to whoever asks.
    expect(refused("http://169.254.170.2/v2/credentials/abc")).toThrow(UntrustedUrlError);
    expect(refused("http://169.254.169.254/latest/meta-data/iam/security-credentials/")).toThrow(UntrustedUrlError);
  });

  it("refuses a host that merely ends with ours", () => {
    expect(refused("https://project.supabase.co.attacker.example/storage/v1/object/x")).toThrow(UntrustedUrlError);
  });

  it("refuses userinfo, where the real host hides after the at sign", () => {
    // `new URL()` reads the host as `evil.example` here and `origin` would agree, so this is
    // rejected on the credentials themselves rather than reasoned about.
    expect(refused("https://project.supabase.co@evil.example/storage/v1/object/x")).toThrow(UntrustedUrlError);
  });

  it("refuses the same host over plain http, which is a downgrade and not our storage", () => {
    expect(refused("http://project.supabase.co/storage/v1/object/x")).toThrow(UntrustedUrlError);
  });

  it("refuses the other services living at the same origin", () => {
    // Auth and PostgREST answer on this host too, and neither of them is a document.
    expect(refused("https://project.supabase.co/rest/v1/organizations?select=*")).toThrow(UntrustedUrlError);
    expect(refused("https://project.supabase.co/auth/v1/admin/users")).toThrow(UntrustedUrlError);
  });

  it("refuses a file:// URL, which fetch would read from the container", () => {
    expect(refused("file:///proc/self/environ")).toThrow(UntrustedUrlError);
  });

  it("refuses text that is not a URL at all", () => {
    expect(refused("not a url")).toThrow(UntrustedUrlError);
  });

  it("names the field but never repeats the URL, which is attacker-chosen log text", () => {
    try {
      guard("layer_upload_url", "http://169.254.170.2/v2/credentials/abc");
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toContain("layer_upload_url");
      expect((error as Error).message).not.toContain("169.254");
    }
  });

  it("works against a local stack, so the guard is on in development too", () => {
    const local = createStorageUrlGuard("http://127.0.0.1:54321");
    const url = "http://127.0.0.1:54321/storage/v1/object/sign/opportunity-documents/a.pdf";
    expect(local("download_url", url)).toBe(url);
    expect(() => local("download_url", "http://127.0.0.1:8080/storage/v1/object/x")).toThrow(UntrustedUrlError);
  });
});
