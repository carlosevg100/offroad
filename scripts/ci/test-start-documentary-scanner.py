"""A failed setup phase must stop before scanning can appear available. No host writes."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class ScannerSetupFailure(unittest.TestCase):
    def run_failure(self, failed_phase):
        with tempfile.TemporaryDirectory(prefix="scanner-failure-") as directory:
            base = Path(directory)
            executable = base / "sudo"
            executable.write_text("""#!/bin/bash
set -eu
printf '%s\\n' "$*" >> "$SCANNER_TEST_CALLS"
if [[ "$*" == *"apt-get"*"update"* && "$SCANNER_TEST_FAILURE" == index ]] ||
   [[ "$*" == *"apt-get"*"install"* && "$SCANNER_TEST_FAILURE" == install ]] ||
   [[ "$*" == *"freshclam --stdout"* && "$SCANNER_TEST_FAILURE" == definitions ]]; then
  exit 42
fi
# The fake only permits pre-daemon setup; a later write/start is itself a test failure.
[[ "$*" == *apt-get* || "$*" == *systemctl* ]] || exit 88
""")
            executable.chmod(0o700)
            environment = dict(os.environ, PATH=str(base) + os.pathsep + os.environ["PATH"],
                               RUNNER_TEMP=str(base), SCANNER_TEST_CALLS=str(base / "calls"),
                               SCANNER_TEST_FAILURE=failed_phase)
            result = subprocess.run(["bash", str(ROOT / "scripts/ci/start-documentary-scanner.sh"), "start"],
                                    env=environment, capture_output=True, text=True, timeout=5)
            self.assertEqual(result.returncode, 42, result.stderr)
            calls = (base / "calls").read_text()
            self.assertNotIn("clamd --config-file", calls)
            self.assertNotIn("tee /etc", calls)
            return calls

    def test_failed_package_index_never_installs_or_refreshes(self):
        calls = self.run_failure("index")
        self.assertNotIn("install -y", calls)
        self.assertNotIn("freshclam --stdout", calls)

    def test_failed_install_never_refreshes_or_starts(self):
        self.assertNotIn("freshclam --stdout", self.run_failure("install"))

    def test_failed_definitions_never_enables_scanning(self):
        self.run_failure("definitions")


if __name__ == "__main__":
    unittest.main()
