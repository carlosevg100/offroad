#!/usr/bin/env python3
"""Read-only check that the Vercel production deployment is the expected merge commit.

Given a deployment id (``dpl_...``) or, when omitted, the latest production deployment of
the project, the verifier asserts that ``meta.githubCommitSha`` equals the expected merge
commit, that the deployment state is ``READY`` and that its target is ``production``.
It prints one JSON summary line (deployment id, commit sha, state, target, created at).

Authentication uses the token in ``VERCEL_TOKEN`` (or the variable named by
``--token-env``); the token is never printed. Nothing is created, promoted or modified.

Exit codes: 0 verified; 1 the deployment was read but an assertion failed; 2 the
deployment could not be read (missing token, HTTP failure, no production deployment)
or the arguments are invalid.
"""
import argparse
from datetime import datetime, timezone
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.vercel.com"
DEPLOYMENT_ID = re.compile(r"^dpl_[A-Za-z0-9]+$")
COMMIT = re.compile(r"^[0-9a-f]{7,40}$")


class ReadFailure(RuntimeError):
    """The deployment could not be read; the message is a short code, never a response body."""


def request(path, token, query=None):
    """One GET against the Vercel REST API. The only network code; tests stub this function."""
    url = API + path + ("?" + urllib.parse.urlencode(query) if query else "")
    call = urllib.request.Request(url, headers={"Authorization": "Bearer " + token, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(call, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise ReadFailure(f"vercel_http_{error.code}") from None
    except ValueError:
        raise ReadFailure("vercel_invalid_response") from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise ReadFailure("vercel_unreachable") from None


def latest_production_deployment(project, team, fetch):
    """Id of the most recent production deployment of the project, whatever its state."""
    query = {"projectId": project, "target": "production", "limit": 1}
    if team:
        query["teamId"] = team
    listed = fetch("/v6/deployments", query)
    rows = listed.get("deployments") if isinstance(listed, dict) else None
    if not rows or not isinstance(rows[0], dict) or not isinstance(rows[0].get("uid"), str):
        raise ReadFailure("no_production_deployment")
    return rows[0]["uid"]


def commit_matches(actual, expected):
    actual, expected = actual.lower(), expected.lower()
    return actual == expected if len(expected) == 40 else actual.startswith(expected)


def created_at(value):
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return None
    try:
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc).isoformat()
    except (OverflowError, OSError, ValueError):
        return None


def assess(deployment, expected_commit):
    """Summary of one deployment record with the failed assertions listed by code."""
    if not isinstance(deployment, dict):
        raise ReadFailure("vercel_invalid_response")
    meta = deployment.get("meta") if isinstance(deployment.get("meta"), dict) else {}
    commit = meta.get("githubCommitSha")
    state = deployment.get("readyState") or deployment.get("state") or deployment.get("status")
    target = deployment.get("target")
    failures = []
    if not isinstance(commit, str) or not COMMIT.fullmatch(commit.lower()) or not commit_matches(commit, expected_commit):
        failures.append("commit_mismatch")
    if state != "READY":
        failures.append("not_ready")
    if target != "production":
        failures.append("not_production")
    summary = {"deploymentId": deployment.get("id") or deployment.get("uid"), "commitSha": commit if isinstance(commit, str) else None,
               "state": state if isinstance(state, str) else None, "target": target if isinstance(target, str) else None,
               "createdAt": created_at(deployment.get("createdAt", deployment.get("created"))), "expectedCommitSha": expected_commit,
               "verified": not failures, "failures": failures}
    substate = deployment.get("readySubstate")
    if isinstance(substate, str):
        summary["readySubstate"] = substate
    return summary


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--expected-commit", required=True, help="merge commit that must be deployed (7 to 40 hex characters)")
    parser.add_argument("--deployment", help="deployment id (dpl_...); when omitted the latest production deployment of --project is resolved")
    parser.add_argument("--project", default=os.environ.get("VERCEL_PROJECT_ID"), help="Vercel project id or name (default: VERCEL_PROJECT_ID)")
    parser.add_argument("--team-id", default=os.environ.get("VERCEL_TEAM_ID"), help="Vercel team id (default: VERCEL_TEAM_ID)")
    parser.add_argument("--token-env", default="VERCEL_TOKEN", help="environment variable holding the API token (default: VERCEL_TOKEN)")
    args = parser.parse_args(argv)
    expected = args.expected_commit.lower()
    if not COMMIT.fullmatch(expected):
        parser.error("--expected-commit must be 7 to 40 hex characters")
    if args.deployment and not DEPLOYMENT_ID.fullmatch(args.deployment):
        parser.error("--deployment must be a Vercel deployment id (dpl_...)")
    if not args.deployment and not args.project:
        parser.error("--project (or VERCEL_PROJECT_ID) is required to resolve the latest production deployment")
    token = os.environ.get(args.token_env)
    if not token:
        print(f"Web deployment verification FAILED: {args.token_env} is not set", file=sys.stderr)
        return 2
    fetch = lambda path, query=None: request(path, token, query)
    try:
        deployment_id = args.deployment or latest_production_deployment(args.project, args.team_id, fetch)
        summary = assess(fetch(f"/v13/deployments/{deployment_id}", {"teamId": args.team_id} if args.team_id else None), expected)
    except ReadFailure as error:
        print(json.dumps({"deploymentId": args.deployment, "expectedCommitSha": expected, "verified": False, "failures": [str(error)]}, sort_keys=True))
        print(f"Web deployment verification FAILED: {error}", file=sys.stderr)
        return 2
    print(json.dumps(summary, sort_keys=True))
    if not summary["verified"]:
        print("Web deployment verification FAILED: " + ", ".join(summary["failures"]), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
