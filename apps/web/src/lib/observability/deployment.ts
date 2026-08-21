/**
 * Which deployment an error came from.
 *
 * Two fields, and without them an error report answers "something broke" and nothing else.
 *
 * `environment` separates production from preview. They shared one stream, so a bug found while
 * testing a branch looked exactly like a bug a company just hit, and the only way to tell them
 * apart was to read the URL on each event and remember which host was which.
 *
 * `release` is the commit. It is what turns "this started happening" into "this started at
 * 54e6ae3", which is the difference between reading a stack trace and reading a diff. Sentry
 * groups regressions by it and marks an issue as resolved-in-release when a later one stops
 * producing it.
 *
 * Both come from what Vercel already sets on the build, so nothing has to be kept in sync by
 * hand. `NEXT_PUBLIC_` because the browser needs them too, and neither is a secret: the commit
 * of a public repository and the word "production".
 */

/** `production`, `preview`, `development`, or `local` when nothing built this. */
export function deploymentEnvironment(): string {
  return process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV ?? "local";
}

/**
 * The commit this bundle was built from, short form, or undefined outside a Vercel build.
 *
 * Undefined rather than a placeholder: a release that says "unknown" would group every local
 * build together and quietly claim they were the same code.
 */
export function deploymentRelease(): string | undefined {
  const sha = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA;
  return sha ? sha.slice(0, 7) : undefined;
}
