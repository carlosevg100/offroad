import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("boot_flag", Path(__file__).with_name("verify-worker-boot-flag.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def event(flag):
    return {"message": json.dumps({"event": "worker.boot", "documentaryWorkPlanningEnabled": flag, "secret": "must-not-be-printed", "at": "2026-09-10T10:00:00.000Z"})}


class BootEvidenceTests(unittest.TestCase):
    def run_diagnostic(self, responses):
        output = io.StringIO()
        env = {"ECS_CLUSTER": "synthetic", "ECS_SERVICE": "worker", "EXPECTED_TASK_DEFINITION": "definition:1", "DOCUMENTARY_WORK_PLANNING_ENABLED": "true"}
        with patch.dict(os.environ, env), patch.object(module, "aws", side_effect=responses) as request, contextlib.redirect_stdout(output):
            code = module.main()
        self.assertNotIn("must-not-be-printed", output.getvalue())
        return code, [json.loads(line) for line in output.getvalue().splitlines()], request

    def inventory(self):
        return [{"taskArns": ["arn/task/current", "arn/task/old"]}, {"tasks": [
            {"taskArn": "arn/task/current", "taskDefinitionArn": "definition:1", "lastStatus": "RUNNING"},
            {"taskArn": "arn/task/old", "taskDefinitionArn": "definition:0", "lastStatus": "RUNNING"}]}]

    def test_verified_current_revision_only(self):
        code, reports, request = self.run_diagnostic(self.inventory() + [{"events": [event(True)]}])
        self.assertEqual(code, 0)
        self.assertEqual(reports, [{"taskId": "current", "documentaryWorkPlanningEnabled": True, "bootProof": "verified", "bootAt": "2026-09-10T10:00:00+00:00"}])
        self.assertIn("worker/document-worker/current", request.call_args.args)
        self.assertEqual(request.call_count, 3)

    def test_contradiction_is_failure(self):
        code, reports, _ = self.run_diagnostic(self.inventory() + [{"events": [event(False), event(True)]}])
        self.assertEqual(code, 1)
        self.assertEqual(reports[0]["bootProof"], "contradiction")

    def test_access_denied_is_unavailable_not_false_proof(self):
        for responses in [[RuntimeError("AccessDenied must-not-be-printed")], self.inventory() + [RuntimeError("AccessDenied must-not-be-printed")]]:
            code, reports, _ = self.run_diagnostic(responses)
            self.assertEqual(code, 0)
            self.assertEqual(reports[0]["bootProof"], "unavailable_aws_read")
            self.assertIsNone(reports[0]["documentaryWorkPlanningEnabled"])

    def test_missing_and_non_boolean_are_not_evidence(self):
        code, reports, _ = self.run_diagnostic(self.inventory() + [{"events": [event("true"), {"message": "not json"}, {"message": "[]"}, {"message": '{"event":"other"}'}]}])
        self.assertEqual(code, 0)
        self.assertEqual(reports[0]["bootProof"], "unavailable")

    def test_empty_inventory(self):
        code, reports, _ = self.run_diagnostic([{"taskArns": []}])
        self.assertEqual(code, 0)
        self.assertEqual(reports[0]["bootProof"], "unavailable_no_running_tasks")


if __name__ == "__main__":
    unittest.main()
