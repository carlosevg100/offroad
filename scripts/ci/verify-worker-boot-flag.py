"""Read-only, best-effort boot evidence; never print raw AWS responses or errors.

Every RUNNING task of the expected task definition must show, in its own log stream,
two structured lines written by apps/document-worker/src/main.ts:

  * ``worker.boot`` with ``documentaryWorkPlanningEnabled`` equal to the release setting;
  * ``worker.pinned_executors_verified``, written only after every installed published
    method artifact was re-hashed and loaded, stamped at or after that boot.

Lines pair by log stream, so evidence from another task never satisfies this one.
A boot line whose pinned-executors line is missing is a failure (exit 1): the process
started but never proved its executors. Boot evidence that cannot be read at all stays
"unavailable" (exit 0): a permission failure is not proof of a bad release.

The image is recorded from the ``ecs describe-tasks`` answer the verifier already needs:
``containers[].image`` is the reference registered by deploy-worker.yml (tagged with
``GITHUB_SHA[:12]``) and ``containers[].imageDigest`` is the manifest digest ECS pulled.
No ECR call and no new permission is involved. The digest is reported, not asserted:
the rollout step already pins the exact task definition that names this image.
"""
from datetime import datetime
import json
import os
import subprocess
import sys

BOOT_EVENT = "worker.boot"
PINNED_EVENT = "worker.pinned_executors_verified"
LOG_GROUP = "/ecs/offroad-document-worker"
STREAM_PREFIX = "worker/document-worker/"
CONTAINER_NAME = "document-worker"
FIELDS = ("taskId", "documentaryWorkPlanningEnabled", "bootProof", "bootAt", "pinnedExecutorsProof", "pinnedExecutorsAt",
          "pinnedArtifacts", "image", "imageDigest", "expectedImageTag", "imageTagMatchesCommit")


def structured_line(event, stream):
    """One structured line from the task's own stream as (message, tz-aware stamp), else None."""
    if event.get("logStreamName") != stream:
        return None
    try:
        message = json.loads(event.get("message", ""))
    except (ValueError, TypeError):
        return None
    if not isinstance(message, dict):
        return None
    try:
        stamp = datetime.fromisoformat(message["at"].replace("Z", "+00:00"))
    except (KeyError, ValueError, TypeError, AttributeError):
        return None
    if stamp.tzinfo is None:
        return None
    return message, stamp


def assess_events(response, expected, stream):
    boots, pinned = [], []
    for event in response.get("events", []):
        line = structured_line(event, stream)
        if line is None:
            continue
        message, stamp = line
        if message.get("event") == BOOT_EVENT and type(message.get("documentaryWorkPlanningEnabled")) is bool:
            boots.append((message["documentaryWorkPlanningEnabled"], stamp))
        elif message.get("event") == PINNED_EVENT:
            artifacts = message.get("artifacts")
            pinned.append((artifacts if type(artifacts) is int else None, stamp))
    if not boots:
        return {"bootProof": "unavailable", "pinnedExecutorsProof": "unavailable"}
    latest_boot_at = max(stamp for _, stamp in boots)
    evidence = {"documentaryWorkPlanningEnabled": expected, "bootProof": "verified", "bootAt": latest_boot_at.isoformat()}
    if any(flag != expected for flag, _ in boots):
        flag, stamp = next(boot for boot in boots if boot[0] != expected)
        evidence = {"documentaryWorkPlanningEnabled": flag, "bootProof": "contradiction", "bootAt": stamp.isoformat()}
    # The pinned line must belong to the latest boot of this stream: never an earlier process.
    paired = [entry for entry in pinned if entry[1] >= latest_boot_at]
    if paired:
        artifacts, stamp = max(paired, key=lambda entry: entry[1])
        evidence.update({"pinnedExecutorsProof": "verified", "pinnedExecutorsAt": stamp.isoformat(), "pinnedArtifacts": artifacts})
    else:
        evidence["pinnedExecutorsProof"] = "missing"
    return evidence


def describe_image(task):
    """Image reference and pulled manifest digest of the worker container, when ECS reports them."""
    container = next((c for c in task.get("containers", []) if isinstance(c, dict) and c.get("name") == CONTAINER_NAME), {})
    image, digest = container.get("image"), container.get("imageDigest")
    return image if isinstance(image, str) else None, digest if isinstance(digest, str) else None


def image_tag(image):
    """Tag of a by-tag reference; None for digest references or untagged names."""
    if not image or "@" in image:
        return None
    _, separator, tag = image.rpartition(":")
    return tag if separator and "/" not in tag else None


def aws(*args):
    result = subprocess.run(["aws", *args, "--output", "json"], capture_output=True, text=True, check=False)
    if result.returncode:
        # Permission failures are diagnostic unavailability, never a reason to undo
        # a healthy deployment. Do not echo stderr: it can contain configuration.
        raise RuntimeError("aws_read_unavailable")
    return json.loads(result.stdout)


def report(task_id, **fields):
    line = dict.fromkeys(FIELDS)
    line.update(fields, taskId=task_id)
    print(json.dumps(line))


def fail(task_id, reason):
    print(f"Worker boot verification FAILED for task {task_id}: {reason}", file=sys.stderr)


def main():
    expected_text = os.environ.get("DOCUMENTARY_WORK_PLANNING_ENABLED", "false")
    if expected_text not in ("true", "false"):
        report(None, bootProof="invalid_expected_flag")
        return 1
    expected = expected_text == "true"
    expected_tag = os.environ.get("GITHUB_SHA", "")[:12] or None
    try:
        listed = aws("ecs", "list-tasks", "--cluster", os.environ["ECS_CLUSTER"], "--service-name", os.environ["ECS_SERVICE"], "--desired-status", "RUNNING")
        arns = listed.get("taskArns", [])
        if not arns:
            report(None, bootProof="unavailable_no_running_tasks")
            return 0
        tasks = aws("ecs", "describe-tasks", "--cluster", os.environ["ECS_CLUSTER"], "--tasks", *arns)
    except (RuntimeError, ValueError, KeyError):
        report(None, bootProof="unavailable_aws_read")
        return 0
    eligible = [task for task in tasks.get("tasks", []) if task.get("lastStatus") == "RUNNING" and task.get("taskDefinitionArn") == os.environ["EXPECTED_TASK_DEFINITION"]]
    if not eligible or tasks.get("failures"):
        report(None, bootProof="unavailable_task_inventory")
    failed = False
    for task in eligible:
        task_id = task["taskArn"].rsplit("/", 1)[-1]
        stream = STREAM_PREFIX + task_id
        image, digest = describe_image(task)
        tag = image_tag(image)
        provenance = {"image": image, "imageDigest": digest, "expectedImageTag": expected_tag,
                      "imageTagMatchesCommit": None if tag is None or expected_tag is None else tag == expected_tag}
        try:
            events = aws("logs", "filter-log-events", "--log-group-name", LOG_GROUP, "--log-stream-names", stream, "--filter-pattern", f'?"{BOOT_EVENT}" ?"{PINNED_EVENT}"')
        except (RuntimeError, ValueError):
            report(task_id, bootProof="unavailable_aws_read", **provenance)
            continue
        evidence = assess_events(events, expected, stream)
        report(task_id, **evidence, **provenance)
        if evidence["bootProof"] == "contradiction":
            fail(task_id, f"{BOOT_EVENT} reported a documentary planning flag that contradicts the release setting")
            failed = True
        if evidence["pinnedExecutorsProof"] == "missing":
            fail(task_id, f"{BOOT_EVENT} was logged but {PINNED_EVENT} was not logged in the same stream at or after it; the worker did not prove its pinned executors")
            failed = True
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
