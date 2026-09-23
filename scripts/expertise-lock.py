#!/usr/bin/env python3
"""Pin and verify the proprietary expertise sources kept in the private repository.

The public repository never contains the expertise library or the founder originals. It keeps
only their SHA-256 digests in `packages/credit-playbook/knowledge/sources/biblioteca-expertise.lock.json`.

Usage:
  python3 scripts/expertise-lock.py write  [--repo PATH]   # regenerate the lock from a local clone
  python3 scripts/expertise-lock.py verify [--repo PATH]   # compare the clone with the lock (exit 1 on drift)

PATH defaults to ../offroad-expertise next to this repository. The clone must be at the commit
recorded in the lock for `verify` to pass; a different commit is reported as drift.
"""
import argparse, hashlib, json, subprocess, sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCK = ROOT / "packages/credit-playbook/knowledge/sources/biblioteca-expertise.lock.json"
ROOTS = ("biblioteca-expertise-2026-09", "originais-do-fundador")
REPOSITORY = "https://github.com/carlosevg100/offroad-expertise"


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def snapshot(repo: Path) -> dict:
    commit = subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"], text=True).strip()
    files = []
    for root in ROOTS:
        base = repo / root
        if not base.is_dir():
            sys.exit(f"missing directory in clone: {base}")
        for path in sorted(p for p in base.rglob("*") if p.is_file()):
            files.append({"path": str(path.relative_to(repo)), "bytes": path.stat().st_size, "sha256": digest(path)})
    return {"commit": commit, "files": files}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("write", "verify"))
    parser.add_argument("--repo", default=str(ROOT.parent / "offroad-expertise"))
    args = parser.parse_args()
    repo = Path(args.repo).resolve()
    current = snapshot(repo)
    if args.command == "write":
        lock = {
            "schemaVersion": "expertise-source-lock.v1",
            "repository": REPOSITORY,
            "visibility": "private",
            "commit": current["commit"],
            "capturedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
            "roots": list(ROOTS),
            "files": current["files"],
        }
        LOCK.write_text(json.dumps(lock, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"lock written: {len(current['files'])} files at {current['commit'][:12]}")
        return 0
    lock = json.loads(LOCK.read_text(encoding="utf-8"))
    drift = []
    if lock["commit"] != current["commit"]:
        drift.append(f"commit {current['commit'][:12]} differs from lock {lock['commit'][:12]}")
    expected = {f["path"]: f["sha256"] for f in lock["files"]}
    actual = {f["path"]: f["sha256"] for f in current["files"]}
    for path in sorted(set(expected) | set(actual)):
        if path not in actual:
            drift.append(f"missing in clone: {path}")
        elif path not in expected:
            drift.append(f"not in lock: {path}")
        elif expected[path] != actual[path]:
            drift.append(f"hash differs: {path}")
    if drift:
        print("\n".join(drift))
        return 1
    print(f"lock verified: {len(actual)} files at {current['commit'][:12]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
