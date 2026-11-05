"""Run transaction checks against the dedicated local PostgreSQL test database."""
import os
import subprocess
from pathlib import Path

env = os.environ.copy()
for line in Path('.env').read_text().splitlines():
    if line.startswith('MUNSHI_TEST_DATABASE_URL='):
        env['DATABASE_URL'] = line.split('=', 1)[1]
        break
else:
    raise SystemExit('Configure MUNSHI_TEST_DATABASE_URL in ignored .env first.')
raise SystemExit(subprocess.run(['node', '--import', 'tsx', '--test', 'server/lib/factory.test.ts'], env=env).returncode)
