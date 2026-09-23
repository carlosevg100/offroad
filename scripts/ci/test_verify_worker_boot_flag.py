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

spec = importlib.util.spec_from_file_location("boot_flag", Path(__file__).with_name("verify-worker-boot-flag.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

STREAM = "worker/document-worker/current"
OTHER_STREAM = "worker/document-worker/other"
COMMIT = "0123456789abcdef0123456789abcdef01234567"
IMAGE = "123456789012.dkr.ecr.sa-east-1.amazonaws.com/offroad/document-worker:0123456789ab"
DIGEST = "sha256:" + "d" * 64


def line(event_name, stream=STREAM, at="2026-09-10T10:00:00.000Z", **fields):
    return {"logStreamName": stream, "message": json.dumps({"event": event_name, "secret": "must-not-be-printed", "at": at, **fields})}


def boot(flag, **overrides):
    return line("worker.boot", documentaryWorkPlanningEnabled=flag, **overrides)


def pinned(artifacts=2, **overrides):
    return line("worker.pinned_executors_verified", artifacts=artifacts, **overrides)


def event(flag):
    return boot(flag)


class BootEvidenceTests(unittest.TestCase):
    def run_diagnostic(self, responses):
        output, errors = io.StringIO(), io.StringIO()
        env = {"ECS_CLUSTER": "synthetic", "ECS_SERVICE": "worker", "EXPECTED_TASK_DEFINITION": "definition:1", "DOCUMENTARY_WORK_PLANNING_ENABLED": "true", "GITHUB_SHA": COMMIT}
        with patch.dict(os.environ, env), patch.object(module, "aws", side_effect=responses) as request, contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors):
            code = module.main()
        self.assertNotIn("must-not-be-printed", output.getvalue() + errors.getvalue())
        self.errors = errors.getvalue()
        return code, [json.loads(line) for line in output.getvalue().splitlines()], request

    def inventory(self):
        return [{"taskArns": ["arn/task/current", "arn/task/old"]}, {"tasks": [
            {"taskArn": "arn/task/current", "taskDefinitionArn": "definition:1", "lastStatus": "RUNNING",
             "containers": [{"name": "document-worker", "image": IMAGE, "imageDigest": DIGEST}]},
            {"taskArn": "arn/task/old", "taskDefinitionArn": "definition:0", "lastStatus": "RUNNING",
             "containers": [{"name": "document-worker", "image": IMAGE.replace("0123456789ab", "aaaaaaaaaaaa"), "imageDigest": "sha256:" + "a" * 64}]}]}]

    def test_verified_current_revision_only(self):
        code, reports, request = self.run_diagnostic(self.inventory() + [{"events": [boot(True), pinned(at="2026-09-10T10:00:02.000Z")]}])
        self.assertEqual(code, 0)
        self.assertEqual(reports, [{"taskId": "current", "documentaryWorkPlanningEnabled": True, "bootProof": "verified", "bootAt": "2026-09-10T10:00:00+00:00",
                                    "pinnedExecutorsProof": "verified", "pinnedExecutorsAt": "2026-09-10T10:00:02+00:00", "pinnedArtifacts": 2,
                                    "image": IMAGE, "imageDigest": DIGEST, "expectedImageTag": "0123456789ab", "imageTagMatchesCommit": True}])
        self.assertIn("worker/document-worker/current", request.call_args.args)
        self.assertIn('?"worker.boot" ?"worker.pinned_executors_verified"', request.call_args.args)
        self.assertEqual(request.call_count, 3)
        self.assertEqual(self.errors, "")

    def test_boot_without_pinned_line_is_failure(self):
        code, reports, _ = self.run_diagnostic(self.inventory() + [{"events": [boot(True)]}])
        self.assertEqual(code, 1)
        self.assertEqual(reports[0]["bootProof"], "verified")
        self.assertEqual(reports[0]["pinnedExecutorsProof"], "missing")
        self.assertIsNone(reports[0]["pinnedExecutorsAt"])
        self.assertIn("worker.pinned_executors_verified was not logged", self.errors)
        self.assertIn("task current", self.errors)

    def test_lines_from_different_tasks_do_not_pair(self):
        code, reports, _ = self.run_diagnostic(self.inventory() + [{"events": [boot(True), pinned(stream=OTHER_STREAM, at="2026-09-10T10:00:02.000Z")]}])
        self.assertEqual(code, 1)
        self.assertEqual(reports[0]["pinnedExecutorsProof"], "missing")
        code, reports, _ = self.run_diagnostic(self.inventory() + [{"events": [boot(True, stream=OTHER_STREAM), pinned(stream=OTHER_STREAM)]}])
        self.assertEqual(code, 0)
        self.assertEqual(reports[0]["bootProof"], "unavailable")
        self.assertEqual(reports[0]["pinnedExecutorsProof"], "unavailable")
        code, reports, _ = self.run_diagnostic(self.inventory() + [{"events": [boot(True), {"message": pinned()["message"]}]}])
        self.assertEqual(code, 1)
        self.assertEqual(reports[0]["pinnedExecutorsProof"], "missing")

    def test_pinned_line_before_the_latest_boot_does_not_pair(self):
        code, reports, _ = self.run_diagnostic(self.inventory() + [{"events": [pinned(at="2026-09-10T09:59:59.000Z"), boot(True)]}])
        self.assertEqual(code, 1)
        self.assertEqual(reports[0]["pinnedExecutorsProof"], "missing")
        code, reports, _ = self.run_diagnostic(self.inventory() + [{"events": [boot(True, at="2026-09-10T09:00:00.000Z"), pinned(at="2026-09-10T09:00:01.000Z"), boot(True)]}])
        self.assertEqual(code, 1)
        self.assertEqual(reports[0]["bootAt"], "2026-09-10T10:00:00+00:00")
        self.assertEqual(reports[0]["pinnedExecutorsProof"], "missing")

    def test_contradiction_is_failure(self):
        code, reports, _ = self.run_diagnostic(self.inventory() + [{"events": [event(False), event(True), pinned()]}])
        self.assertEqual(code, 1)
        self.assertEqual(reports[0]["bootProof"], "contradiction")
        self.assertEqual(reports[0]["pinnedExecutorsProof"], "verified")
        self.assertIn("contradicts the release setting", self.errors)

    def test_access_denied_is_unavailable_not_false_proof(self):
        for responses in [[RuntimeError("AccessDenied must-not-be-printed")], self.inventory() + [RuntimeError("AccessDenied must-not-be-printed")]]:
            code, reports, _ = self.run_diagnostic(responses)
            self.assertEqual(code, 0)
            self.assertEqual(reports[0]["bootProof"], "unavailable_aws_read")
            self.assertIsNone(reports[0]["documentaryWorkPlanningEnabled"])
            self.assertIsNone(reports[0]["pinnedExecutorsProof"])
        self.assertEqual(reports[0]["imageDigest"], DIGEST)

    def test_missing_and_non_boolean_are_not_evidence(self):
        code, reports, _ = self.run_diagnostic(self.inventory() + [{"events": [event("true"), {"logStreamName": STREAM, "message": "not json"}, {"logStreamName": STREAM, "message": "[]"}, line("other"), pinned()]}])
        self.assertEqual(code, 0)
        self.assertEqual(reports[0]["bootProof"], "unavailable")
        self.assertEqual(reports[0]["pinnedExecutorsProof"], "unavailable")

    def test_non_integer_artifact_count_is_recorded_as_unknown(self):
        code, reports, _ = self.run_diagnostic(self.inventory() + [{"events": [boot(True), pinned(artifacts="2")]}])
        self.assertEqual(code, 0)
        self.assertEqual(reports[0]["pinnedExecutorsProof"], "verified")
        self.assertIsNone(reports[0]["pinnedArtifacts"])

    def test_empty_inventory(self):
        code, reports, _ = self.run_diagnostic([{"taskArns": []}])
        self.assertEqual(code, 0)
        self.assertEqual(reports[0]["bootProof"], "unavailable_no_running_tasks")

    def test_image_provenance_is_recorded_not_asserted(self):
        inventory = self.inventory()
        inventory[1]["tasks"][0]["containers"] = [{"name": "document-worker", "image": IMAGE.replace("0123456789ab", "ffffffffffff"), "imageDigest": DIGEST}]
        code, reports, _ = self.run_diagnostic(inventory + [{"events": [boot(True), pinned()]}])
        self.assertEqual(code, 0)
        self.assertEqual(reports[0]["imageTagMatchesCommit"], False)
        inventory[1]["tasks"][0]["containers"] = [{"name": "sidecar", "image": IMAGE, "imageDigest": DIGEST}]
        code, reports, _ = self.run_diagnostic(inventory + [{"events": [boot(True), pinned()]}])
        self.assertEqual(code, 0)
        self.assertEqual((reports[0]["image"], reports[0]["imageDigest"], reports[0]["imageTagMatchesCommit"]), (None, None, None))

    def test_image_tag_parsing(self):
        self.assertEqual(module.image_tag(IMAGE), "0123456789ab")
        self.assertIsNone(module.image_tag("registry:5000/offroad/document-worker"))
        self.assertIsNone(module.image_tag("registry/offroad/document-worker@sha256:" + "d" * 64))
        self.assertIsNone(module.image_tag(None))


if __name__ == "__main__":
    unittest.main()
