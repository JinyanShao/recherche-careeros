import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import {
  appendFile,
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  stat,
  writeFile,
} from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { _electron as electron } from 'playwright';

const projectRoot = path.resolve(import.meta.dirname, '..');
const careerOpsSource = process.env.RECHERCHE_CAREER_OPS_SOURCE
  || '/Users/jinyanshao/Developer/Active-正在开发的正式项目/ThirdParty-克隆的第三方项目/career-ops';
const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'recherche-stage6-'));
const electronData = path.join(fixtureRoot, 'electron-data');
const launchAgents = path.join(fixtureRoot, 'LaunchAgents');
const launchctlLog = path.join(fixtureRoot, 'launchctl.log');
const notificationLog = path.join(fixtureRoot, 'notifications.jsonl');
const requestLog = path.join(fixtureRoot, 'requests.log');
const launchctlShim = path.join(fixtureRoot, 'launchctl-shim');
const packagedExecutable = path.join(projectRoot, 'out/Recherche CareerOS-darwin-arm64/Recherche CareerOS.app/Contents/MacOS/Recherche CareerOS');
const electronExecutable = path.join(projectRoot, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const nodeExecutable = '/Users/jinyanshao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node';
const execFileAsync = promisify(execFile);
await stat(packagedExecutable);

await Promise.all([
  mkdir(path.join(fixtureRoot, 'config'), { recursive: true }),
  mkdir(path.join(fixtureRoot, 'data'), { recursive: true }),
  mkdir(path.join(fixtureRoot, 'reports'), { recursive: true }),
  mkdir(path.join(fixtureRoot, 'modes'), { recursive: true }),
  mkdir(launchAgents, { recursive: true }),
]);

const reserveShim = `import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const reports = path.join(process.cwd(), 'reports'); mkdirSync(reports, { recursive: true });
if (process.argv[2] === '--release') { const file = path.join(reports, process.argv[3] + '-RESERVED.md'); if (existsSync(file)) unlinkSync(file); process.exit(0); }
let next = Math.max(0, ...readdirSync(reports).map((name) => Number(name.match(/^(\\d+)-/)?.[1] || 0))) + 1;
while (true) { const number = String(next).padStart(3, '0'); try { writeFileSync(path.join(reports, number + '-RESERVED.md'), 'reserved', { flag: 'wx' }); console.log(number); break; } catch (error) { if (error.code !== 'EEXIST') throw error; next += 1; } }
`;

const mergeShim = `import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const root = process.cwd(); const lock = path.join(root, 'batch', '.fixture-merge-lock');
while (true) { try { mkdirSync(lock); break; } catch { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20); } }
try { const tracker = path.join(root, 'data/applications.md'); const additions = path.join(root, 'batch/tracker-additions'); const merged = path.join(additions, 'merged'); mkdirSync(merged, { recursive: true }); let content = existsSync(tracker) ? readFileSync(tracker, 'utf8') : '# Applications Tracker\\n\\n| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\\n|---|---|---|---|---|---|---|---|---|\\n'; for (const name of readdirSync(additions).filter((entry) => entry.endsWith('.tsv'))) { const fields = readFileSync(path.join(additions, name), 'utf8').trim().split('\\t'); const [num,date,company,role,status,score,pdf,report,notes] = fields; content += '| ' + [num,date,company,role,score,status,pdf,report,notes].join(' | ') + ' |\\n'; renameSync(path.join(additions, name), path.join(merged, name)); } writeFileSync(tracker, content); } finally { rmdirSync(lock); }
`;

const reconcileShim = `import { existsSync, readFileSync, writeFileSync } from 'node:fs'; import path from 'node:path'; const root = process.cwd(); const state = path.join(root, 'batch/batch-state.tsv'); const pipeline = path.join(root, 'data/pipeline.md'); if (existsSync(state) && existsSync(pipeline)) { const done = new Set(readFileSync(state, 'utf8').split(/\\r?\\n/).slice(1).map((line) => line.split('\\t')).filter((row) => row[2] === 'completed').map((row) => row[1])); let content = readFileSync(pipeline, 'utf8'); content = content.split(/\\r?\\n/).map((line) => { const match = line.match(/^\\s*- \\[ \\] ([^| ]+)/); return match && done.has(match[1]) ? line.replace('[ ]', '[x]') : line; }).join('\\n'); writeFileSync(pipeline, content); }
`;

const cv = `# Fixture Candidate

## Summary

Backend engineer using Python, FastAPI, SQL, REST APIs, tests, Git and AWS.

## Experience

### Backend Engineer

- Built Python services and production APIs.

## Skills

Python, FastAPI, SQL, REST APIs, AWS, Git
`;
const profile = `candidate:\n  full_name: Fixture Candidate\n  location: Switzerland\ntarget_roles:\n  primary: [Backend Engineer]\nlocation:\n  country: Switzerland\nlanguage:\n  output: en\nspend_tier: standard\n`;

await Promise.all([
  cp(path.join(careerOpsSource, 'package.json'), path.join(fixtureRoot, 'package.json')),
  writeFile(path.join(fixtureRoot, 'AGENTS.md'), '# Fixture career-ops\n'),
  writeFile(path.join(fixtureRoot, 'scan.mjs'), 'export {};\n'),
  writeFile(path.join(fixtureRoot, 'reserve-report-num.mjs'), reserveShim),
  writeFile(path.join(fixtureRoot, 'merge-tracker.mjs'), mergeShim),
  writeFile(path.join(fixtureRoot, 'reconcile-pipeline.mjs'), reconcileShim),
  writeFile(path.join(fixtureRoot, 'verify-pipeline.mjs'), 'console.log("pipeline valid");\n'),
  writeFile(path.join(fixtureRoot, 'cv.md'), cv),
  writeFile(path.join(fixtureRoot, 'config/profile.yml'), profile),
  writeFile(path.join(fixtureRoot, 'modes/_profile.md'), '# Target\n\nBackend Engineer\n'),
  writeFile(path.join(fixtureRoot, 'modes/_custom.md'), '# House Rules\n\nNever invent facts.\n'),
  writeFile(path.join(fixtureRoot, 'data/pipeline.md'), '# Pipeline\n'),
  writeFile(launchctlShim, `#!/bin/sh\nprintf '%s\\n' "$*" >> '${launchctlLog}'\nexit 0\n`),
]);
await chmod(launchctlShim, 0o755);

const blocks = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((id) => ({
  id,
  title: ({ A: 'Role Summary', B: 'Match with CV', C: 'Level and Strategy', D: 'Comp and Demand', E: 'Customization Plan', F: 'Interview Plan', G: 'Posting Legitimacy' })[id],
  score: id === 'G' ? null : 4.4,
  summary: `${id} evidence-based batch evaluation.`,
  details: [`Structured detail for ${id}.`],
  evidence: [{ source: id === 'B' ? 'cv.md' : id === 'G' ? 'liveness' : 'JD', quote: id === 'G' ? 'active' : id === 'B' ? 'Python, FastAPI, SQL, REST APIs, AWS, Git' : 'Python and FastAPI' }],
  risks: [],
}));

let modelActive = 0;
let modelMaxActive = 0;
const modelAttempts = new Map();
const server = createServer((request, response) => {
  appendFileSync(requestLog, `${request.method} ${request.url}\n`);
  if (request.url?.startsWith('/job/')) {
    const id = request.url.split('/').pop();
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><title>Batch Role ${id} · Fixture Labs</title><main><h1>Batch Role ${id}</h1><p>Fixture Labs seeks a Backend Engineer ${id}. This position builds Python and FastAPI services, maintains SQL databases, designs REST APIs, writes automated tests, reviews code, supports AWS deployments, debugs production incidents, documents decisions, works with product teams, and communicates clearly. This detailed posting remains open for applications and includes enough factual content for isolated extraction.</p><button>Apply now</button></main>`);
    return;
  }
  if (request.url === '/v1/chat/completions' && request.method === 'POST') {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const id = body.match(/Batch Role (\d+)/)?.[1] || '0';
      const attempt = (modelAttempts.get(id) || 0) + 1;
      modelAttempts.set(id, attempt);
      modelActive += 1;
      modelMaxActive = Math.max(modelMaxActive, modelActive);
      setTimeout(() => {
        modelActive -= 1;
        if (id === '2' && attempt === 1) {
          response.writeHead(500, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ error: { message: 'fixture transient failure' } }));
          return;
        }
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({
            company: `Fixture Labs ${id}`,
            role: `Batch Role ${id}`,
            location: 'Switzerland', archetype: 'Backend Engineer', score: 4.4,
            finalDecision: 'Apply', confidence: 'High', advertisedComp: 'CHF 100,000',
            workAuth: 'unstated', legitimacyTier: 'High Confidence', blocks,
            legitimacySignals: [{ name: 'Apply control', finding: 'Visible', weight: 'Positive', evidence: 'Apply now' }],
            riskSummary: { legitimacy: 'high_confidence', classification: 'clear', culture: 'pass', interview_redflags: 'not_evaluated', ai_infra: 'consistent' },
            keywords: ['Python', 'FastAPI'], errors: [],
          }) } }],
          usage: { prompt_tokens: 900, completion_tokens: 400 },
        }));
      }, 300);
    });
    return;
  }
  response.writeHead(404); response.end('not found');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert.ok(address && typeof address === 'object');
const baseUrl = `http://127.0.0.1:${address.port}`;
await writeFile(path.join(fixtureRoot, 'data/pipeline.md'), `# Pipeline\n\n${[1, 2, 3].map((id) => `- [ ] ${baseUrl}/job/${id} | Fixture Labs ${id} | Batch Role ${id} | Switzerland`).join('\n')}\n`);

const app = await electron.launch({
  executablePath: electronExecutable,
  args: [projectRoot, `--user-data-dir=${electronData}`],
  env: {
    ...process.env,
    CAREER_OPS_ROOT: fixtureRoot,
    RECHERCHE_NODE_PATH: nodeExecutable,
    RECHERCHE_TEST_ALLOW_LOOPBACK: '1',
    RECHERCHE_TEST_ALLOW_UNVERIFIED_CAREER_OPS: '1',
    RECHERCHE_LAUNCH_AGENTS_DIR: launchAgents,
    RECHERCHE_LAUNCHCTL_PATH: launchctlShim,
    RECHERCHE_EXECUTABLE_PATH: packagedExecutable,
    RECHERCHE_NOTIFICATION_LOG: notificationLog,
  },
});
let appClosed = false;

try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(60_000);
  await page.waitForFunction(() => document.querySelector('#profile-name')?.textContent === 'Fixture Candidate');
  await page.evaluate((url) => window.careerOps.saveAiSettings({
    provider: 'openai-compatible', baseUrl: `${url}/v1`, model: 'fixture-model', apiKey: 'stage6-secret-key',
    inputPricePerMillion: 1, outputPricePerMillion: 2, clearKey: false,
  }), baseUrl);

  await page.locator('.nav-item[data-section="jobs"]').click();
  await page.locator('[data-route="jobs-batch"]').click();
  await page.waitForFunction(() => document.querySelectorAll('#batch-jobs-body tr').length === 3);
  assert.equal(await page.locator('#batch-jobs-body tr').count(), 3);
  await page.locator('#batch-concurrency').fill('2');
  await page.locator('#batch-max-retries').fill('1');
  await page.locator('#batch-retry-delay').fill('0');
  await page.locator('#batch-limit').fill('3');
  await page.locator('#batch-notify-score').fill('4');
  await page.getByRole('button', { name: '开始批量评分' }).click();
  await page.waitForFunction(() => document.querySelector('#batch-state-label')?.textContent === '已完成');
  await page.waitForFunction(() => document.querySelectorAll('.batch-status-pill.status-completed').length === 3);
  assert.ok(modelMaxActive >= 2, `expected concurrency >= 2, saw ${modelMaxActive}`);
  assert.equal(modelAttempts.get('2'), 2);
  assert.equal(await page.locator('#batch-high-match-count').textContent(), '3 个高分岗位');
  const notifications = (await readFile(notificationLog, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(notifications.length, 3);
  assert.ok(notifications.every((item) => item.score === 4.4));
  await page.screenshot({ path: path.join(projectRoot, 'stage-6-batch-complete.png'), fullPage: true });

  await page.locator('.nav-item[data-section="settings"]').click();
  await page.locator('[data-route="settings-automation"]').click();
  await page.locator('#schedule-enabled').check();
  await page.locator('#schedule-hour').fill('8');
  await page.locator('#schedule-minute').fill('30');
  await page.getByRole('button', { name: '保存每日计划' }).click();
  await page.waitForFunction(() => document.querySelector('#schedule-state')?.textContent === '已安装并启用');
  const plistPath = path.join(launchAgents, 'io.recherche.career-ops.daily.plist');
  const plist = await readFile(plistPath, 'utf8');
  assert.match(plist, /StartCalendarInterval/);
  assert.match(plist, /--recherche-daily-batch/);
  assert.match(plist, /<integer>8<\/integer>/);
  assert.doesNotMatch(plist, /\/bin\/(ba)?sh/);
  const custom = await readFile(path.join(fixtureRoot, 'modes/_custom.md'), 'utf8');
  assert.match(custom, /RECHERCHE_DAILY_AUTOMATION_START/);
  assert.match(await readFile(launchctlLog, 'utf8'), /bootstrap/);
  assert.ok((await readdir(path.join(fixtureRoot, 'data/automation/backups'))).length >= 1);
  await page.screenshot({ path: path.join(projectRoot, 'stage-6-schedule.png'), fullPage: true });

  await appendFile(path.join(fixtureRoot, 'modes/_custom.md'), '\nExternal schedule edit.\n');
  await page.getByRole('button', { name: '保存每日计划' }).click();
  await page.waitForFunction(() => document.querySelector('#notice')?.textContent?.includes('其他进程修改'));

  await appendFile(path.join(fixtureRoot, 'data/pipeline.md'), `\n- [ ] ${baseUrl}/job/4 | Fixture Labs 4 | Batch Role 4 | Switzerland\n- [ ] ${baseUrl}/job/5 | Fixture Labs 5 | Batch Role 5 | Switzerland\n`);
  await page.locator('.nav-item[data-section="jobs"]').click();
  await page.locator('[data-route="jobs-batch"]').click();
  await page.getByRole('button', { name: '重新读取任务' }).click();
  await page.waitForFunction(() => document.querySelector('#batch-pending-count')?.textContent === '2');
  await page.locator('#batch-concurrency').fill('1');
  await page.locator('#batch-limit').fill('0');
  await page.getByRole('button', { name: '开始批量评分' }).click();
  await page.waitForFunction(() => document.querySelector('#batch-active-count')?.textContent === '1' && document.querySelector('#batch-queued-count')?.textContent === '1');
  await page.getByRole('button', { name: '停止任务' }).click();
  await page.waitForFunction(() => document.querySelector('#batch-state-label')?.textContent === '已停止');
  await page.waitForFunction(() => document.querySelectorAll('.batch-status-pill.status-pending').length === 1);
  await page.getByRole('button', { name: '恢复未完成' }).click();
  await page.waitForFunction(() => document.querySelector('#batch-state-label')?.textContent === '已完成');
  await page.waitForFunction(() => document.querySelectorAll('.batch-status-pill.status-completed').length === 5);
  assert.match(await readFile(path.join(fixtureRoot, 'data/automation/batch.log'), 'utf8'), /Batch cancelled/);
  assert.match(await readFile(path.join(fixtureRoot, 'data/automation/batch.log'), 'utf8'), /Batch completed/);

  await appendFile(path.join(fixtureRoot, 'data/pipeline.md'), `\n- [ ] ${baseUrl}/job/6 | Fixture Labs 6 | Batch Role 6 | Switzerland\n`);
  await app.close();
  appClosed = true;
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  const headless = await execFileAsync(electronExecutable, [
    projectRoot, '--recherche-daily-batch', '--career-ops-root', fixtureRoot, `--user-data-dir=${electronData}`,
  ], {
    env: {
      ...process.env,
      RECHERCHE_NODE_PATH: nodeExecutable,
      RECHERCHE_TEST_ALLOW_LOOPBACK: '1',
      RECHERCHE_TEST_ALLOW_UNVERIFIED_CAREER_OPS: '1',
      RECHERCHE_NOTIFICATION_LOG: notificationLog,
    },
    timeout: 60_000,
  });
  assert.equal(headless.stderr, '');
  const finalState = await readFile(path.join(fixtureRoot, 'batch/batch-state.tsv'), 'utf8');
  assert.match(finalState, /\/job\/6\tcompleted\t/);

  console.log(JSON.stringify({
    fixtureRoot, concurrentWorkers: modelMaxActive, transientRetryAttempts: modelAttempts.get('2'),
    cancellationAndResume: true, launchAgentInstalled: true, scheduleConflictRejected: true,
    highScoreNotifications: notifications.length, headlessRun: true,
  }, null, 2));
} finally {
  if (!appClosed) await app.close();
  await new Promise((resolve) => server.close(resolve));
}
