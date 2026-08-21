import {afterEach, describe, expect, it} from "vitest";

import {deploymentEnvironment, deploymentRelease} from "./deployment";

const original = {...process.env};
afterEach(() => {
  process.env = {...original};
});

describe("an error says which deployment it came from", () => {
  it("reads the environment Vercel set", () => {
    process.env.NEXT_PUBLIC_VERCEL_ENV = "production";
    expect(deploymentEnvironment()).toBe("production");

    process.env.NEXT_PUBLIC_VERCEL_ENV = "preview";
    expect(deploymentEnvironment()).toBe("preview");
  });

  it("says local when nothing built this, rather than claiming production", () => {
    delete process.env.NEXT_PUBLIC_VERCEL_ENV;
    delete process.env.VERCEL_ENV;
    expect(deploymentEnvironment()).toBe("local");
  });

  it("shortens the commit to what a person reads in a git log", () => {
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA = "54e6ae3f1b0c1e2b7a4d4e9a1e2c9f0a1b2c3d4e";
    expect(deploymentRelease()).toBe("54e6ae3");
  });

  it("returns nothing outside a build rather than a placeholder", () => {
    // "unknown" would group every local build together and claim they were the same code.
    delete process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    expect(deploymentRelease()).toBeUndefined();
  });
});
