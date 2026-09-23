"""Stubbed checks for the read-only Vercel deployment verifier; no network is used."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True

SPEC = importlib.util.spec_from_file_location("web_deployment", Path(__file__).with_name("verify-web-deployment.py"))
VERIFIER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFIER)

COMMIT = "0123456789abcdef0123456789abcdef01234567"
TOKEN = "must-not-be-printed"


def deployment(**overrides):
    record = {"id": "dpl_ready", "readyState": "READY", "readySubstate": "PROMOTED", "target": "production", "createdAt": 1790164800000,
              "meta": {"githubCommitSha": COMMIT, "githubCommitRef": "main", "githubCommitAuthorLogin": "must-not-be-printed-author"}}
    record.update(overrides)
    return record


class WebDeploymentVerifierTests(unittest.TestCase):
    def run_verifier(self, argv, responses, env=None):
        calls = []

        def stub(path, token, query=None):
            self.assertEqual(token, TOKEN)
            calls.append((path, query))
            answer = responses.pop(0)
            if isinstance(answer, Exception):
                raise answer
            return answer

        output, errors = io.StringIO(), io.StringIO()
        environment = {"VERCEL_TOKEN": TOKEN, **(env or {})}
        with patch.dict(os.environ, environment, clear=False), patch.object(VERIFIER, "request", side_effect=stub), contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors):
            code = VERIFIER.main(argv)
        printed = output.getvalue() + errors.getvalue()
        self.assertNotIn("must-not-be-printed", printed)
        self.assertEqual(responses, [], "every stubbed response must be consumed")
        return code, json.loads(output.getvalue().strip().splitlines()[-1]), errors.getvalue(), calls

    def test_ready_production_deployment_of_expected_commit_passes(self):
        code, summary, errors, calls = self.run_verifier(["--expected-commit", COMMIT, "--deployment", "dpl_ready"], [deployment()])
        self.assertEqual(code, 0)
        self.assertEqual(summary, {"deploymentId": "dpl_ready", "commitSha": COMMIT, "state": "READY", "target": "production", "createdAt": "2026-09-23T12:00:00+00:00",
                                   "expectedCommitSha": COMMIT, "readySubstate": "PROMOTED", "verified": True, "failures": []})
        self.assertEqual(calls, [("/v13/deployments/dpl_ready", None)])
        self.assertEqual(errors, "")

    def test_wrong_commit_fails(self):
        code, summary, errors, _ = self.run_verifier(["--expected-commit", "f" * 40, "--deployment", "dpl_ready"], [deployment()])
        self.assertEqual(code, 1)
        self.assertEqual(summary["failures"], ["commit_mismatch"])
        self.assertEqual(summary["commitSha"], COMMIT)
        self.assertIn("commit_mismatch", errors)

    def test_not_ready_fails(self):
        for state in ["BUILDING", "ERROR", "CANCELED", None]:
            code, summary, _, _ = self.run_verifier(["--expected-commit", COMMIT, "--deployment", "dpl_ready"], [deployment(readyState=state)])
            self.assertEqual(code, 1)
            self.assertEqual(summary["failures"], ["not_ready"])

    def test_not_production_fails(self):
        for target in ["staging", None]:
            code, summary, _, _ = self.run_verifier(["--expected-commit", COMMIT, "--deployment", "dpl_ready"], [deployment(target=target)])
            self.assertEqual(code, 1)
            self.assertEqual(summary["failures"], ["not_production"])

    def test_every_failed_assertion_is_listed(self):
        code, summary, _, _ = self.run_verifier(["--expected-commit", "f" * 40, "--deployment", "dpl_ready"], [deployment(readyState="BUILDING", target=None, meta={})])
        self.assertEqual(code, 1)
        self.assertEqual(summary["failures"], ["commit_mismatch", "not_ready", "not_production"])
        self.assertIsNone(summary["commitSha"])

    def test_latest_production_deployment_is_resolved_from_the_project(self):
        listed = {"deployments": [{"uid": "dpl_latest", "state": "READY", "target": "production"}]}
        code, summary, _, calls = self.run_verifier(["--expected-commit", COMMIT, "--project", "prj_synthetic", "--team-id", "team_synthetic"], [listed, deployment(id="dpl_latest")])
        self.assertEqual(code, 0)
        self.assertEqual(summary["deploymentId"], "dpl_latest")
        self.assertEqual(calls, [("/v6/deployments", {"projectId": "prj_synthetic", "target": "production", "limit": 1, "teamId": "team_synthetic"}),
                                 ("/v13/deployments/dpl_latest", {"teamId": "team_synthetic"})])

    def test_project_and_team_default_to_the_environment(self):
        listed = {"deployments": [{"uid": "dpl_latest"}]}
        code, _, _, calls = self.run_verifier(["--expected-commit", COMMIT], [listed, deployment(id="dpl_latest")], env={"VERCEL_PROJECT_ID": "prj_env", "VERCEL_TEAM_ID": "team_env"})
        self.assertEqual(code, 0)
        self.assertEqual(calls[0][1]["projectId"], "prj_env")
        self.assertEqual(calls[0][1]["teamId"], "team_env")

    def test_no_production_deployment_is_unreadable_not_a_pass(self):
        for listed in [{"deployments": []}, {}, {"deployments": [{"state": "READY"}]}]:
            code, summary, errors, _ = self.run_verifier(["--expected-commit", COMMIT, "--project", "prj_synthetic"], [listed])
            self.assertEqual(code, 2)
            self.assertEqual(summary["failures"], ["no_production_deployment"])
            self.assertFalse(summary["verified"])
            self.assertIn("no_production_deployment", errors)

    def test_http_failure_is_unreadable_without_echoing_the_response(self):
        code, summary, errors, _ = self.run_verifier(["--expected-commit", COMMIT, "--deployment", "dpl_ready"], [VERIFIER.ReadFailure("vercel_http_403")])
        self.assertEqual(code, 2)
        self.assertEqual(summary["failures"], ["vercel_http_403"])
        self.assertIn("vercel_http_403", errors)

    def test_missing_token_is_unreadable(self):
        output, errors = io.StringIO(), io.StringIO()
        with patch.dict(os.environ, {"VERCEL_TOKEN": ""}), patch.object(VERIFIER, "request") as request, contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors):
            code = VERIFIER.main(["--expected-commit", COMMIT, "--deployment", "dpl_ready"])
        self.assertEqual(code, 2)
        self.assertIn("VERCEL_TOKEN is not set", errors.getvalue())
        request.assert_not_called()

    def test_abbreviated_expected_commit_matches_by_prefix_only(self):
        code, summary, _, _ = self.run_verifier(["--expected-commit", COMMIT[:12].upper(), "--deployment", "dpl_ready"], [deployment()])
        self.assertEqual(code, 0)
        self.assertEqual(summary["expectedCommitSha"], COMMIT[:12])
        code, summary, _, _ = self.run_verifier(["--expected-commit", "abcdef0", "--deployment", "dpl_ready"], [deployment()])
        self.assertEqual(code, 1)
        self.assertEqual(summary["failures"], ["commit_mismatch"])

    def test_invalid_arguments_are_rejected_before_any_request(self):
        for argv in [["--expected-commit", "not-a-sha", "--deployment", "dpl_ready"], ["--expected-commit", COMMIT, "--deployment", "https://example.invalid"], ["--expected-commit", COMMIT]]:
            with patch.dict(os.environ, {"VERCEL_TOKEN": TOKEN, "VERCEL_PROJECT_ID": ""}), patch.object(VERIFIER, "request") as request, contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as stop:
                    VERIFIER.main(argv)
            self.assertEqual(stop.exception.code, 2)
            request.assert_not_called()

    def test_request_raises_short_codes_only(self):
        import urllib.error
        with patch.object(VERIFIER.urllib.request, "urlopen", side_effect=urllib.error.HTTPError("https://api.vercel.com/x", 401, "must-not-be-printed", {}, None)):
            with self.assertRaises(VERIFIER.ReadFailure) as failure:
                VERIFIER.request("/v13/deployments/dpl_ready", TOKEN)
        self.assertEqual(str(failure.exception), "vercel_http_401")
        self.assertIsNone(failure.exception.__cause__)
        with patch.object(VERIFIER.urllib.request, "urlopen", side_effect=urllib.error.URLError("must-not-be-printed")):
            with self.assertRaises(VERIFIER.ReadFailure) as failure:
                VERIFIER.request("/v13/deployments/dpl_ready", TOKEN)
        self.assertEqual(str(failure.exception), "vercel_unreachable")

    def test_created_at_is_rendered_from_milliseconds_or_omitted(self):
        self.assertEqual(VERIFIER.created_at(1790164800000), "2026-09-23T12:00:00+00:00")
        self.assertIsNone(VERIFIER.created_at("1790164800000"))
        self.assertIsNone(VERIFIER.created_at(True))
        self.assertIsNone(VERIFIER.created_at(None))


if __name__ == "__main__":
    unittest.main()
