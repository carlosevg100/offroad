#!/usr/bin/env python3
"""Rollback-only 3T SQL authority evaluation, using actual 3S producer commands.
Storage metadata in this SQL fixture is not a physical HTTP claim.
"""
import os,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
source=(ROOT/'scripts/ci/test-material-production-plan-native.py').read_text()
source=source.replace("'material_production_terminal.sql']","'material_production_terminal.sql','material_package_native_review.sql','material_retire_experimental_approvals.sql']")
source=source.replace("consumer+=expand(ROOT/'supabase/tests/support/material_production_native_denials.sql')","consumer+=expand(ROOT/'supabase/tests/support/material_package_native_review.sql')")
exec(compile(source,str(ROOT/'scripts/ci/test-material-production-plan-native.py'),'exec'))
