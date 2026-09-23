#!/usr/bin/env python3
"""Reconcile the reviewed stage-zero inventory with the objects a set of migrations installed.

Usage:
  python3 scripts/reconcile-stage0-inventory.py --migrations name1,name2 --catalogue objects.json \
    --stage "17 / 3N" --owner "Engenharia de execução, etapa 17" \
    --reason "Why these objects exist" --migration-reason "Why the migration exists" [--staging-catalogue objects.json]

`objects.json` holds `{"objects": [...]}` in the shape produced by `scripts/ci/stage0-catalogue.sql`,
captured from production (and, optionally, from staging). Only objects that belong to the listed
migrations (by DDL anchor) are added or updated; nothing is inferred and nothing is removed.
"""
import argparse, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "docs/build/arcabouco-stage0/object-decisions.json"
OBJECT_MAP = ROOT / "docs/build/arcabouco-stage0/OBJECT-MAP.md"


def anchor_for(obj, files):
    patterns = {
        "table": rf"^create table (if not exists )?{re.escape(obj['schema'])}\.{re.escape(obj['name'])}\b",
        "function": rf"^create (or replace )?function {re.escape(obj['schema'])}\.{re.escape(obj['name'])}\(",
        "policy": rf"^create policy {re.escape(obj['name'])}\b",
        "trigger": rf"^create trigger {re.escape(obj['name'])}\b",
        "view": rf"^create (or replace )?view {re.escape(obj['schema'])}\.{re.escape(obj['name'])}\b",
    }
    pattern = patterns.get(obj["kind"])
    if not pattern:
        return None
    for file in reversed(files):
        lines = file.read_text(encoding="utf-8").splitlines()
        hits = [i for i, line in enumerate(lines) if re.search(pattern, line)]
        if hits:
            i = hits[-1]
            return {"path": str(file.relative_to(ROOT)), "line": i + 1, "anchor": lines[i], "mechanism": "direct_ddl"}
    return None


def normalized(value):
    if isinstance(value, dict):
        return {k: normalized(v) for k, v in sorted(value.items())}
    if isinstance(value, list):
        return sorted((normalized(v) for v in value), key=lambda v: json.dumps(v, sort_keys=True))
    return value


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--migrations", required=True)
    parser.add_argument("--catalogue", required=True, type=Path)
    parser.add_argument("--staging-catalogue", type=Path)
    parser.add_argument("--stage", required=True)
    parser.add_argument("--owner", required=True)
    parser.add_argument("--reason", required=True)
    parser.add_argument("--migration-reason", required=True)
    parser.add_argument("--map-title", default=None)
    args = parser.parse_args()
    names = [n.strip() for n in args.migrations.split(",") if n.strip()]
    files = []
    for name in names:
        matches = sorted((ROOT / "supabase/migrations").glob(f"*_{name}.sql"))
        if len(matches) != 1:
            sys.exit(f"migration not found or ambiguous: {name}")
        files.append(matches[0])
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    known = {row["id"]: row for row in manifest["objects"]}
    production = json.loads(args.catalogue.read_text(encoding="utf-8"))["objects"]
    staging = json.loads(args.staging_catalogue.read_text(encoding="utf-8"))["objects"] if args.staging_catalogue else production
    staging_by_id = {o["id"]: o for o in staging}
    added, updated, skipped = [], [], []
    for obj in production:
        loc = anchor_for(obj, files)
        if loc is None:
            skipped.append(obj["id"])
            continue
        entry = {"production": obj, "staging": staging_by_id.get(obj["id"], obj)}
        if normalized(entry["production"]) != normalized(entry["staging"]):
            sys.exit(f"production and staging differ for {obj['id']}")
        row = known.get(obj["id"])
        if row is None:
            row = {"id": obj["id"], "kind": obj["kind"], "catalogues": entry, "owner": args.owner, "decision": "preservar",
                   "stage": args.stage, "reason": args.reason, "sources": [loc]}
            manifest["objects"].append(row); known[obj["id"]] = row; added.append(obj["id"])
        else:
            changed = normalized(row["catalogues"].get("production")) != normalized(obj)
            row["catalogues"] = entry
            if loc not in row["sources"]:
                row["sources"].append(loc)
            if changed:
                updated.append(obj["id"])
    paths = {x["path"] for x in manifest["repository_items"]}
    for file in files:
        rel = str(file.relative_to(ROOT))
        if rel not in paths:
            manifest["repository_items"].append({"kind": "migration", "path": rel, "decision": "preservar", "stage": args.stage, "reason": args.migration_reason})
    manifest["objects"].sort(key=lambda x: x["id"])
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.map_title:
        with OBJECT_MAP.open("a", encoding="utf-8") as fh:
            fh.write(f"\n## {args.map_title}\n\n{len(added)} objetos novos e {len(updated)} atualizados. {args.reason}\n")
            for key in added:
                fh.write(f"- `{key}`\n")
    print(json.dumps({"added": len(added), "updated": len(updated), "skipped_not_in_migrations": len(skipped), "migrationFiles": [f.name for f in files]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
