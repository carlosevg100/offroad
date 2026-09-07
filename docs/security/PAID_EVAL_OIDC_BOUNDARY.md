# Paid evaluation OIDC boundary

The repository defines one common boundary for every GitHub Actions job that assumes
`offroadGitHubEvalsRole` and can therefore access model-provider credentials for paid
evaluations.

Each consumer must:

- run only when `github.repository` is `carlosevg100/offroad` and `github.ref` is
  `refs/heads/main`;
- bind the job to the GitHub Environment named `intent-router-gold-main`;
- check out the exact triggering `github.sha`; and
- request only `contents: read` and `id-token: write` from GitHub.

The release-governance static test discovers role consumers directly from every workflow file,
compares them with the reviewed consumer list and rejects a consumer that omits any part of this
boundary. The shared Environment is the repository-side control point for paid evaluations; it is
not evidence that the Environment's protection rules are configured or operating.

The repository also does not verify the AWS role's OIDC trust policy, effective permissions, use
history or recertification. Those remain external controls that require dated evidence from GitHub
and AWS before the boundary can be described as operationally verified.
