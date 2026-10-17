// usage: node support/collect-results.js <runNumber> <path to TEST_PLAN.md> <output results.json>
const fs = require('fs');
const path = require('path');

const [runArg, planPath, outPath] = process.argv.slice(2);
if (!runArg || !planPath || !outPath) {
  console.error('usage: node support/collect-results.js <runNumber> <TEST_PLAN.md> <results.json>');
  process.exit(2);
}
const run = Number(runArg);
const reports = path.join(__dirname, '..', 'reports');
const ID_RE = /TC-\d+/;

// plan: id -> priority (table columns: | Test ID | Req ID | Type | Priority | ...)
const plan = new Map();
for (const line of fs.readFileSync(planPath, 'utf8').split(/\r?\n/)) {
  const cells = line.split('|').map((c) => c.trim());
  if (cells.length > 5 && /^TC-\d+$/.test(cells[1])) plan.set(cells[1], cells[4]);
}

const found = new Map(); // id -> { status, reason }
const rank = { fail: 3, blocked: 2, pass: 1 };
function record(id, status, reason) {
  const prev = found.get(id);
  if (!prev || rank[status] > rank[prev.status]) found.set(id, { status, reason: reason || '' });
}
const clean = (s) => String(s || '').replace(/\u001b\[[0-9;]*m/g, '').split('\n').slice(0, 6).join(' ').slice(0, 600);

const apiFile = path.join(reports, 'api.json');
if (fs.existsSync(apiFile)) {
  const j = JSON.parse(fs.readFileSync(apiFile, 'utf8'));
  for (const tr of j.testResults || []) {
    for (const a of tr.assertionResults || []) {
      const m = (a.title || '').match(ID_RE) || (a.fullName || '').match(ID_RE);
      if (!m) continue;
      if (a.status === 'passed') record(m[0], 'pass');
      else if (a.status === 'failed') record(m[0], 'fail', clean((a.failureMessages || [])[0]));
      else record(m[0], 'blocked', 'skipped/pending in Jest');
    }
    if (tr.status === 'failed' && (!tr.assertionResults || tr.assertionResults.length === 0)) {
      console.warn('Jest suite failed to run: ' + tr.name + ' ' + clean(tr.message));
    }
  }
}

const e2eFile = path.join(reports, 'e2e.json');
function walk(suite) {
  for (const spec of suite.specs || []) {
    const m = (spec.title || '').match(ID_RE);
    if (!m) continue;
    const results = (spec.tests || []).flatMap((t) => t.results || []);
    if (results.length === 0) { record(m[0], 'blocked', 'no result'); continue; }
    const last = results[results.length - 1];
    if (last.status === 'passed') record(m[0], 'pass');
    else if (last.status === 'skipped') record(m[0], 'blocked', 'skipped');
    else record(m[0], 'fail', clean((last.error && last.error.message) || last.status));
  }
  for (const s of suite.suites || []) walk(s);
}
if (fs.existsSync(e2eFile)) {
  const j = JSON.parse(fs.readFileSync(e2eFile, 'utf8'));
  for (const s of j.suites || []) walk(s);
}

const results = [];
let passed = 0, failed = 0, blocked = 0, p0Failed = 0;
for (const [id, priority] of plan) {
  const f = found.get(id);
  let status, reason;
  if (!f) { status = 'blocked'; reason = 'not automated or not run'; }
  else { status = f.status; reason = f.reason; }
  if (status === 'pass') passed++;
  else if (status === 'fail') failed++;
  else blocked++;
  if (status !== 'pass' && priority === 'P0') p0Failed++;
  results.push({ id, priority, status, reason });
}
const total = plan.size;
const out = {
  run, plan_total: total, passed, failed, blocked,
  pass_rate: total ? Number((passed / total).toFixed(4)) : 0, p0_failed: p0Failed, results,
};
fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`run ${run}: total ${total}, passed ${passed}, failed ${failed}, blocked ${blocked}, pass_rate ${out.pass_rate}, p0_failed ${p0Failed}`);
