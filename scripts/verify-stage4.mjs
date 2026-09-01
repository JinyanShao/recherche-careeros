import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright';
import { configuredNodeExecutable } from './env.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'recherche-stage4-'));
const electronData = path.join(fixtureRoot, 'electron-data');
const packagedExecutable = path.join(
  projectRoot,
  'out',
  'Recherche CareerOS-darwin-arm64',
  'Recherche CareerOS.app',
  'Contents',
  'MacOS',
  'Recherche CareerOS',
);
const electronExecutable = path.join(
  projectRoot,
  'node_modules',
  'electron',
  'dist',
  'Electron.app',
  'Contents',
  'MacOS',
  'Electron',
);
const nodeExecutable = configuredNodeExecutable();
const today = new Date().toISOString().slice(0, 10);

await stat(packagedExecutable);
await Promise.all([
  mkdir(electronData, { recursive: true }),
  mkdir(path.join(fixtureRoot, 'config'), { recursive: true }),
  mkdir(path.join(fixtureRoot, 'data'), { recursive: true }),
  mkdir(path.join(fixtureRoot, 'reports'), { recursive: true }),
  mkdir(path.join(fixtureRoot, 'modes'), { recursive: true }),
]);

const reserveShim = `import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const reports = path.join(process.cwd(), 'reports');
mkdirSync(reports, { recursive: true });
if (process.argv[2] === '--release') {
  const file = path.join(reports, \`${'${process.argv[3]}'}-RESERVED.md\`);
  if (existsSync(file)) unlinkSync(file);
} else {
  const numbers = readdirSync(reports).map((name) => Number(name.match(/^(\\d+)-/)?.[1] || 0));
  const next = String(Math.max(0, ...numbers) + 1).padStart(3, '0');
  writeFileSync(path.join(reports, \`${'${next}'}-RESERVED.md\`), 'reserved', { flag: 'wx' });
  console.log(next);
}
`;

const mergeShim = `import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const tracker = path.join(root, 'data/applications.md');
const additions = path.join(root, 'batch/tracker-additions');
const merged = path.join(additions, 'merged');
mkdirSync(merged, { recursive: true });
let content = existsSync(tracker) ? readFileSync(tracker, 'utf8') : '# Applications Tracker\\n\\n| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\\n|---|---|---|---|---|---|---|---|---|\\n';
for (const name of readdirSync(additions).filter((entry) => entry.endsWith('.tsv'))) {
  const [num, date, company, role, status, score, pdf, report, notes] = readFileSync(path.join(additions, name), 'utf8').trim().split('\\t');
  content += \`| ${'${num}'} | ${'${date}'} | ${'${company}'} | ${'${role}'} | ${'${score}'} | ${'${status}'} | ${'${pdf}'} | ${'${report}'} | ${'${notes}'} |\\n\`;
  renameSync(path.join(additions, name), path.join(merged, name));
}
writeFileSync(tracker, content);
`;

const cv = `# Fixture Candidate

## Summary

Junior Backend Engineer with Python, FastAPI, SQL, and REST APIs.

## Experience

### Backend Developer

- Built Python and FastAPI services with SQL.

## Projects

### Order API

- Tested REST APIs with CI.

## Skills

Python, FastAPI, SQL, REST APIs
`;
const profile = `candidate:
  full_name: "Fixture Candidate"
  location: "Fribourg, Switzerland"
target_roles:
  primary: ["Junior Backend Engineer"]
narrative:
  headline: "Junior Backend Engineer"
location:
  country: "Switzerland"
language:
  output: en
spend_tier: standard
fact_verification:
  items: {}
`;

await Promise.all([
  writeFile(path.join(fixtureRoot, 'AGENTS.md'), '# Fixture career-ops\n'),
  writeFile(path.join(fixtureRoot, 'package.json'), '{"name":"career-ops-stage4-fixture","private":true}\n'),
  writeFile(path.join(fixtureRoot, 'scan.mjs'), 'export {};\n'),
  writeFile(path.join(fixtureRoot, 'reserve-report-num.mjs'), reserveShim),
  writeFile(path.join(fixtureRoot, 'merge-tracker.mjs'), mergeShim),
  writeFile(path.join(fixtureRoot, 'cv.md'), cv),
  writeFile(path.join(fixtureRoot, 'config/profile.yml'), profile),
  writeFile(path.join(fixtureRoot, 'modes/_profile.md'), '# Target\n\nJunior Backend Engineer\n'),
  writeFile(path.join(fixtureRoot, 'modes/_custom.md'), '# House Rules\n\nNever invent facts.\n'),
  writeFile(path.join(fixtureRoot, 'data/pipeline.md'), '# Pipeline\n'),
]);

const jd = `Fixture Labs is hiring a Junior Backend Engineer in Fribourg, Switzerland. The role builds Python and FastAPI services, maintains SQL databases, designs REST APIs, writes automated tests, reviews code, and supports AWS deployments. Responsibilities include debugging production issues, documenting technical decisions, and collaborating with product teams. Requirements include practical Python experience, FastAPI knowledge, SQL fundamentals, Git, testing, and clear communication. Salary: CHF 90,000. This is a full-time hybrid role. Work authorization and visa sponsorship are not stated.`;

const blocks = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((id) => ({
  id,
  title: ({ A: 'Role Summary', B: 'Match with CV', C: 'Level and Strategy', D: 'Comp and Demand', E: 'Customization Plan', F: 'Interview Plan', G: 'Posting Legitimacy' })[id],
  score: id === 'G' ? null : ({ A: 4.4, B: 4.5, C: 4.2, D: 3.8, E: 4.1, F: 4.0 })[id],
  summary: `${id} evaluation based on supplied evidence.`,
  details: [`Structured detail for block ${id}.`],
  evidence: id === 'G'
    ? [{ source: 'liveness', quote: 'active' }]
    : id === 'B'
      ? [{ source: 'cv.md', quote: 'Python, FastAPI, SQL, REST APIs' }]
      : [{ source: 'JD', quote: 'Python and FastAPI' }],
  risks: id === 'D' ? ['External salary market research is unavailable.'] : [],
}));

const modelResult = {
  company: 'Fixture Labs',
  role: 'Junior Backend Engineer',
  location: 'Fribourg, Switzerland',
  archetype: 'Junior Backend Engineer',
  score: 4.2,
  finalDecision: 'Consider',
  confidence: 'High',
  advertisedComp: 'CHF 90,000',
  workAuth: 'unstated',
  legitimacyTier: 'High Confidence',
  blocks,
  legitimacySignals: [{ name: 'Apply control', finding: 'Visible on the live page', weight: 'Positive', evidence: 'Apply' }],
  riskSummary: {
    legitimacy: 'high_confidence',
    classification: 'not_evaluated',
    culture: 'caution',
    interview_redflags: 'not_evaluated',
    ai_infra: 'not_evaluated',
  },
  keywords: ['Python', 'FastAPI', 'REST APIs'],
  errors: [],
};

const server = createServer((request, response) => {
  if (request.url === '/job') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><title>Junior Backend Engineer · Fixture Labs</title><main><h1>Junior Backend Engineer</h1><p>${jd}</p><button>Apply now</button></main>`);
    return;
  }
  if (request.url === '/v1/models' && request.method === 'GET') {
    assert.equal(request.headers.authorization, 'Bearer stage4-secret-token-4321');
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ data: [{ id: 'fixture-model' }, { id: 'fixture-vision-model' }] }));
    return;
  }
  if (request.url === '/v1/chat/completions' && request.method === 'POST') {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      assert.equal(request.headers.authorization, 'Bearer stage4-secret-token-4321');
      assert.equal(JSON.parse(body).model, 'fixture-model');
      const pastedJd = body.includes('not_applicable');
      const responseResult = structuredClone(modelResult);
      responseResult.blocks[6].evidence = [{
        source: 'liveness',
        quote: pastedJd ? 'not_applicable' : 'active',
      }];
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(responseResult) } }],
        usage: { prompt_tokens: 1000, completion_tokens: 500 },
      }));
    });
    return;
  }
  response.writeHead(404);
  response.end('not found');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert.ok(address && typeof address === 'object');
const baseUrl = `http://127.0.0.1:${address.port}`;
await writeFile(path.join(fixtureRoot, 'data/pipeline.md'), `# Pipeline

## Pending

- [ ] ${baseUrl}/job | Fixture Labs | Junior Backend Engineer | Fribourg, Switzerland | posted:2026-08-01 | trust:95
`);
await writeFile(path.join(electronData, 'ai-provider-settings.json'), JSON.stringify({
  version: 1,
  provider: 'openai-compatible',
  baseUrl: `${baseUrl}/v1`,
  model: 'legacy-fixture-model',
  inputPricePerMillion: 0.5,
  outputPricePerMillion: 1,
}, null, 2));

const app = await electron.launch({
  executablePath: electronExecutable,
  args: [projectRoot, `--user-data-dir=${electronData}`],
  env: {
    ...process.env,
    CAREER_OPS_ROOT: fixtureRoot,
    RECHERCHE_NODE_PATH: nodeExecutable,
    RECHERCHE_TEST_ALLOW_LOOPBACK: '1',
    RECHERCHE_TEST_ALLOW_UNVERIFIED_CAREER_OPS: '1',
  },
});

try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(30_000);
  await page.waitForFunction(() => document.querySelector('#profile-name')?.textContent === 'Fixture Candidate');
  await page.locator('.nav-item[data-section="jobs"]').click();
  await page.locator('[data-route="jobs-evaluate"]').click();
  await page.waitForSelector('#model-provider');
  const migratedSettings = await page.evaluate(() => window.careerOps.getAiSettings());
  assert.equal(migratedSettings.services.length, 1);
  assert.equal(migratedSettings.model, 'legacy-fixture-model');
  await page.locator('#add-model-service-button').click();
  await page.locator('[data-create-model-preset="openai"]').click();
  await page.waitForFunction(() => document.querySelectorAll('.model-service-tab').length === 2);
  await page.screenshot({ path: path.join(projectRoot, 'stage-4-input-settings.png') });

  await page.locator('#model-base-url').fill(`${baseUrl}/v1`);
  await page.locator('#model-name').fill('fixture-model');
  await page.locator('#model-api-key').fill('stage4-secret-token-4321');
  await page.locator('#model-temperature').fill('0.2');
  await page.locator('#model-max-output').fill('4096');
  await page.locator('#model-timeout').fill('45');
  await page.locator('#model-input-price').fill('1');
  await page.locator('#model-output-price').fill('2');
  await page.getByRole('button', { name: '测试连接' }).click();
  await page.waitForFunction(() => document.querySelector('#model-connection-state')?.textContent?.includes('连接成功'));
  await page.getByRole('button', { name: '模型列表' }).click();
  await page.waitForFunction(() => document.querySelectorAll('#model-options option').length === 2);
  await page.getByRole('button', { name: '保存模型设置' }).click();
  await page.waitForFunction(() => document.querySelector('#model-key-state')?.textContent?.includes('4321'));

  const publicSettings = await page.evaluate(() => window.careerOps.getAiSettings());
  assert.equal(publicSettings.keyConfigured, true);
  assert.equal(publicSettings.services.length, 2);
  assert.equal(publicSettings.temperature, 0.2);
  assert.equal(publicSettings.maxOutputTokens, 4096);
  assert.equal(publicSettings.timeoutSeconds, 45);
  assert.equal(Object.hasOwn(publicSettings, 'apiKey'), false);
  assert.equal(publicSettings.services.every((service) => !Object.hasOwn(service, 'apiKey') && !Object.hasOwn(service, 'encryptedApiKey')), true);
  const settingsFile = path.join(electronData, 'ai-provider-settings.json');
  const encryptedSettings = await readFile(settingsFile, 'utf8');
  assert.doesNotMatch(encryptedSettings, /stage4-secret-token/);

  await page.getByRole('button', { name: 'JD 文本' }).click();
  await page.locator('#job-jd-input').fill(jd);
  await page.getByRole('button', { name: '开始完整评估' }).click();
  await page.waitForFunction(() => (
    !document.querySelector('#evaluation-result')?.classList.contains('hidden')
    || !document.querySelector('#evaluation-error')?.classList.contains('hidden')
  ));
  if (await page.locator('#evaluation-error').isVisible()) {
    throw new Error(`JD evaluation failed: ${(await page.locator('#evaluation-error').textContent())?.trim()}`);
  }
  assert.equal(await page.locator('#job-evaluation-score').textContent(), '4.2');
  assert.equal(await page.locator('#job-legitimacy-tier').textContent(), 'Proceed with Caution');
  assert.equal(await page.locator('#job-cost').textContent(), '$0.002000');
  assert.equal(await page.locator('#job-evaluation-blocks .evaluation-block-row').count(), 7);
  assert.match(await page.locator('#job-evaluation-errors').textContent() ?? '', /粘贴 JD/);

  await page.getByRole('button', { name: 'URL', exact: true }).click();
  await page.locator('#job-url-input').fill(`${baseUrl}/job`);
  await page.getByRole('button', { name: '开始完整评估' }).click();
  await page.waitForFunction(() => document.querySelector('#job-report-number')?.textContent === '002');
  assert.equal(await page.locator('#job-liveness-status').textContent(), 'active');
  assert.equal(await page.locator('#job-legitimacy-tier').textContent(), 'High Confidence');
  assert.equal(await page.locator('#job-tracker-status').textContent(), '申请记录已登记');
  await page.locator('.nav-item[data-section="jobs"]').click();
  await page.locator('[data-route="jobs-inbox"]').click();
  await page.locator('#job-workbench-content').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('#workbench-report-state')?.textContent === '已完成');
  assert.equal((await page.locator('#workbench-primary-action').textContent())?.trim(), '准备申请材料');
  assert.equal((await page.locator('#workbench-tracker-status').textContent())?.trim(), 'Evaluated');
  assert.equal(await page.locator('#workbench-report-button').isVisible(), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  await page.locator('[data-route="jobs-evaluate"]').click();
  await page.screenshot({ path: path.join(projectRoot, 'stage-4-evaluation-result.png') });
  const horizontalOverflow = await page.locator('#evaluation-result').evaluate((root) => (
    [...root.querySelectorAll('.evaluation-verdict-band, .evaluation-run-metrics, .evaluation-block-row, .evaluation-bottom-grid > section')]
      .filter((node) => node.scrollWidth > node.clientWidth + 1)
      .map((node) => ({ className: node.className, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }))
  ));
  assert.deepEqual(horizontalOverflow, []);
  await page.locator('.evaluation-blocks-section').screenshot({
    path: path.join(projectRoot, 'stage-4-a-g-blocks.png'),
  });
  await page.locator('.evaluation-bottom-grid').screenshot({
    path: path.join(projectRoot, 'stage-4-risks-errors.png'),
  });

  const reports = (await readdir(path.join(fixtureRoot, 'reports'))).filter((name) => name.endsWith('.md'));
  assert.deepEqual(reports.sort(), [
    `001-fixture-labs-${today}.md`,
    `002-fixture-labs-${today}.md`,
  ]);
  const report = await readFile(path.join(fixtureRoot, 'reports', reports[1]), 'utf8');
  assert.match(report, /## Machine Summary/);
  assert.match(report, /## A\) Role Summary/);
  assert.match(report, /## G\) Posting Legitimacy/);
  assert.match(report, /\$0\.002000 USD/);
  assert.match(report, /career-ops classifier test gate/);
  const tracker = await readFile(path.join(fixtureRoot, 'data/applications.md'), 'utf8');
  assert.equal((tracker.match(/Fixture Labs/g) ?? []).length, 2);

  await page.setViewportSize({ width: 1040, height: 720 });
  await page.locator('.nav-item[data-section="jobs"]').click();
  await page.locator('[data-route="jobs-evaluate"]').click();
  const settingsOverflow = await page.locator('.model-settings-pane').evaluate((root) => (
    [...root.querySelectorAll('.model-settings-grid, .model-settings-actions, .model-picker-line, .secret-input, .model-quick-presets')]
      .filter((node) => node.scrollWidth > node.clientWidth + 1)
      .map((node) => ({ className: node.className, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }))
  ));
  assert.deepEqual(settingsOverflow, []);
  await page.locator('.model-settings-pane').screenshot({ path: path.join(projectRoot, 'stage-4-model-settings-1040.png') });

  const exposedMethods = await page.evaluate(() => Object.keys(window.careerOps).sort());
  assert.deepEqual(exposedMethods, [
    'analyzeReply',
    'cancelBatch',
    'cancelScan',
    'compareApplicationMaterialVersions',
    'confirmPositioning',
    'createAiService',
    'deleteAiService',
    'evaluateJob',
    'generateApplicationMaterials',
    'getAiSettings',
    'getApplicationMaterialsWorkspace',
    'getAtsWorkspace',
    'getAutomationWorkspace',
    'getBatchStatus',
    'getCompetitivenessAnalysis',
    'getFollowupCadence',
    'getScanStatus',
    'getSnapshot',
    'listAiModels',
    'matchInvite',
    'openApplicationMaterial',
    'readReport',
    'recordOutcome',
    'runAiCompetitivenessAnalysis',
    'saveAiSettings',
    'saveCv',
    'saveDailyAutomation',
    'savePortals',
    'saveProfile',
    'seedFollowup',
    'selectAiService',
    'selectDirectory',
    'startBatch',
    'startScan',
    'testAiConnection',
    'updateTrackerStatus',
  ]);

  console.log(JSON.stringify({
    fixtureRoot,
    encryptedKeyAtRest: true,
    keyNotExposedToRenderer: true,
    pastedJdEvaluated: true,
    liveUrlEvaluated: true,
    blocksRendered: 7,
    reportsWritten: reports.length,
    trackerRowsMerged: 2,
    estimatedCostUsd: 0.002,
    exposedMethods,
  }, null, 2));
} finally {
  await app.close();
  await new Promise((resolve) => server.close(resolve));
}
