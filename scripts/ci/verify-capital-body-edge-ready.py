#!/usr/bin/env python3
"""Local CI readiness: require the actual reader handler, never a gateway 401.

The local anon JWT proves platform signature verification, then the reader denies
its non-worker role. CLI server credentials are captured privately, never emitted
or sent to the client. This probe does not allocate or read an object.
"""
import json
import os
import shlex
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request


def main():
    api_url = os.environ['OFFROAD_E2E_API_URL'].rstrip('/')
    parsed = urllib.parse.urlsplit(api_url)
    if (parsed.scheme != 'http' or parsed.hostname not in ('127.0.0.1', 'localhost')
            or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment):
        raise RuntimeError('edge_readiness_requires_local_api')
    status = subprocess.run(['supabase', 'status', '-o', 'env'], capture_output=True,
                            text=True, timeout=15)
    if status.returncode:
        raise RuntimeError('edge_readiness_local_status_unavailable')
    values = {}
    for line in status.stdout.splitlines():
        if '=' in line:
            name, value = line.split('=', 1)
            if name in ('ANON_KEY', 'PUBLISHABLE_KEY'):
                parts = shlex.split(value)
                if len(parts) == 1:
                    values[name] = parts[0]
    anon = values.get('ANON_KEY', '')
    if len(anon.split('.')) != 3:
        raise RuntimeError('edge_readiness_signed_local_anon_key_unavailable')
    # Fixed synthetic UUID. The unauthenticated role is denied before scope lookup.
    payload = json.dumps({'kind': 'typed_body',
                          'allocationId': '00000000-0000-4000-8000-000000000001'}).encode()
    headers = {'Authorization': 'Bearer ' + anon,
               'apikey': values.get('PUBLISHABLE_KEY', anon), 'Content-Type': 'application/json',
               'x-offroad-workspace': '00000000-0000-4000-8000-000000000001',
               'x-offroad-job-id': '00000000-0000-4000-8000-000000000001',
               'x-offroad-capability': 'synthetic-edge-readiness-denied'}
    deadline = time.monotonic() + 50
    while time.monotonic() < deadline:
        request = urllib.request.Request(api_url + '/functions/v1/capital-body-read',
                                         data=payload, headers=headers, method='POST')
        try:
            with urllib.request.urlopen(request, timeout=2) as response:
                response.read(1024)
        except urllib.error.HTTPError as error:
            body = error.read(1024)
            try:
                parsed_body = json.loads(body)
            except (ValueError, UnicodeError):
                parsed_body = None
            if (error.code == 403 and parsed_body == {'error': 'capital_body_read_denied'}
                    and 'no-store' in error.headers.get('Cache-Control', '').lower()):
                print('capital_body_edge_authenticated_handler_ready: PASS')
                return
        except (OSError, TimeoutError):
            pass
        time.sleep(0.5)
    raise RuntimeError('edge_readiness_actual_handler_not_observed')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # Do not expose requests, CLI output, credentials or server response bodies.
        print('capital_body_edge_authenticated_handler_ready: FAIL')
        raise SystemExit(1)
