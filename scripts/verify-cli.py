"""Exercise real actions against a disposable PGlite database, never the dev factory."""
import json, os, re, subprocess, uuid

env = dict(os.environ, DATABASE_URL='pglite:/tmp/munshi-cli-validation', AGENT_USER_EMAIL='dev@local.test', AGENT_ORG_ID='munshi-cli-test')

# Stage 2 roles: factory actions now require the owner app role. Seed the CLI
# user as the org owner through the framework org API (the normal creation
# path), so owner-guarded actions run. If the org already exists, leave it.
# The fresh disposable DB first needs the framework + app release migrations
# (the same path as scripts/migrate-production.ts).
seed = """const { withMigrationRuntime, closeDbExec } = await import('@agent-native/core/db');
const { runFrameworkReleaseMigrations, runAppReleaseMigrations } = await import('@agent-native/core/server');
await withMigrationRuntime(async () => { await runFrameworkReleaseMigrations(null); await runAppReleaseMigrations(); });
await closeDbExec();
const { createOrganization } = await import('@agent-native/core/org');
try { await createOrganization('CLI test factory', 'dev@local.test', 'owner', { id: 'munshi-cli-test' }); }
catch (e) { console.log('seed:', e.message); if (!/duplicate|unique|exists|conflict/i.test(e.message)) process.exit(1); }"""
seeded=subprocess.run(['node','--import','tsx','--input-type=module','-e',seed],env=env,text=True,capture_output=True,timeout=180)
if seeded.returncode: raise RuntimeError(seeded.stderr or seeded.stdout)
def action(name, args, approved=False, succeeds=True):
    cmd=['./node_modules/.bin/agent-native','action',name,json.dumps(args)]
    if approved: cmd.append('--approved')
    result=subprocess.run(cmd,env=env,text=True,capture_output=True,timeout=60)
    if succeeds and result.returncode: raise RuntimeError(result.stderr)
    if not succeeds and not result.returncode: raise AssertionError('Expected rejection')
    return result.stdout+result.stderr

action('load-demo-data',{'requestId':str(uuid.uuid4())},True)
state=action('get-factory',{})
customer=re.search(r"customers: \[\s*\{\s*id: '([^']+)'",state).group(1)
revision=int(re.search(r'revision: (\d+)',state).group(1))
from datetime import datetime, timezone
planned_at=datetime.now(timezone.utc).isoformat()
operation={'kind':'record-payment','customerId':customer,'amountPaise':12345,'mode':'cash'}
args={'requestId':str(uuid.uuid4()),'revision':revision,'plannedAt':planned_at,'operation':operation}
first=action('save-proposal',args,True)
second=action('save-proposal',args,True)
assert re.search(r"id: '([^']+)'",first).group(1)==re.search(r"id: '([^']+)'",second).group(1)
assert 'plan changed' in action('save-proposal',{**args,'requestId':str(uuid.uuid4())},True,False)
args2={**args,'requestId':str(uuid.uuid4()),'revision':revision+1}
action('save-proposal',args2,True)
state=action('get-factory',{})
assert state.count('amountPaise: 12345')==2
assert f'revision: {revision+2}' in state
print('PASS: real CLI writes deduplicate the same request, accept a new payment request, reject a stale revision, and read back exactly two payments.')
