"""Read-only, best-effort boot evidence; never print raw AWS responses or errors."""
from datetime import datetime
import json
import os
import subprocess
import sys


def assess_events(response, expected):
    boots = []
    for event in response.get("events", []):
        try:
            message = json.loads(event.get("message", ""))
        except (ValueError, TypeError):
            continue
        if not isinstance(message, dict) or message.get("event") != "worker.boot":
            continue
        flag = message.get("documentaryWorkPlanningEnabled")
        if type(flag) is not bool:
            continue
        try:
            stamp = datetime.fromisoformat(message["at"].replace("Z", "+00:00"))
            if stamp.tzinfo is None:
                continue
        except (KeyError, ValueError, TypeError, AttributeError):
            continue
        boots.append((flag, stamp.isoformat()))
    if not boots:
        return "unavailable", None, None
    if any(flag != expected for flag, _ in boots):
        flag, stamp = next(boot for boot in boots if boot[0] != expected)
        return "contradiction", flag, stamp
    return "verified", expected, boots[-1][1]


def aws(*args):
    result = subprocess.run(["aws", *args, "--output", "json"], capture_output=True, text=True, check=False)
    if result.returncode:
        # Permission failures are diagnostic unavailability, never a reason to undo
        # a healthy deployment. Do not echo stderr: it can contain configuration.
        raise RuntimeError("aws_read_unavailable")
    return json.loads(result.stdout)


def report(task_id, status, flag=None, stamp=None):
    print(json.dumps({"taskId": task_id, "documentaryWorkPlanningEnabled": flag, "bootProof": status, "bootAt": stamp}))


def main():
    expected_text = os.environ.get("DOCUMENTARY_WORK_PLANNING_ENABLED", "false")
    if expected_text not in ("true", "false"):
        report(None, "invalid_expected_flag")
        return 1
    expected = expected_text == "true"
    try:
        listed = aws("ecs", "list-tasks", "--cluster", os.environ["ECS_CLUSTER"], "--service-name", os.environ["ECS_SERVICE"], "--desired-status", "RUNNING")
        arns = listed.get("taskArns", [])
        if not arns:
            report(None, "unavailable_no_running_tasks")
            return 0
        tasks = aws("ecs", "describe-tasks", "--cluster", os.environ["ECS_CLUSTER"], "--tasks", *arns)
    except (RuntimeError, ValueError, KeyError):
        report(None, "unavailable_aws_read")
        return 0
    eligible = [task for task in tasks.get("tasks", []) if task.get("lastStatus") == "RUNNING" and task.get("taskDefinitionArn") == os.environ["EXPECTED_TASK_DEFINITION"]]
    if not eligible or tasks.get("failures"):
        report(None, "unavailable_task_inventory")
    contradicted = False
    for task in eligible:
        task_id = task["taskArn"].rsplit("/", 1)[-1]
        try:
            events = aws("logs", "filter-log-events", "--log-group-name", "/ecs/offroad-document-worker", "--log-stream-names", "worker/document-worker/" + task_id, "--filter-pattern", '"worker.boot"')
            status, flag, stamp = assess_events(events, expected)
            report(task_id, status, flag, stamp)
            contradicted |= status == "contradiction"
        except (RuntimeError, ValueError):
            report(task_id, "unavailable_aws_read")
    return 1 if contradicted else 0


if __name__ == "__main__":
    sys.exit(main())
